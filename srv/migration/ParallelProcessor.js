/**
 * ParallelProcessor - Controlled concurrency for I/O bound operations
 * 
 * Provides parallel processing with configurable concurrency limits,
 * essential for efficient attachment migration (download/upload are I/O bound).
 */

class ParallelProcessor {
    /**
     * Process items with controlled concurrency
     * 
     * @param {Array} items - Items to process
     * @param {Function} processFn - Async function: (item, index) => Promise
     * @param {Object} options - { concurrency, delayBetweenItems, stopOnError, onProgress }
     * @returns {Promise<Array>} Results with { status, value?, reason?, item, index }
     */
    async process(items, processFn, options = {}) {
        const { concurrency = 5, delayBetweenItems = 0, stopOnError = false, onProgress = null } = options;

        if (!items || items.length === 0) return [];

        const results = [];
        const executing = new Set();
        let completed = 0;
        let shouldStop = false;

        for (let i = 0; i < items.length; i++) {
            if (shouldStop) break;
            const item = items[i];
            
            const promise = (async () => {
                try {
                    const value = await processFn(item, i);
                    return { status: 'fulfilled', value, item, index: i };
                } catch (error) {
                    if (stopOnError) shouldStop = true;
                    return { status: 'rejected', reason: error, item, index: i };
                }
            })();

            const wrappedPromise = promise.then(result => {
                executing.delete(wrappedPromise);
                completed++;
                if (onProgress) {
                    try { onProgress({ completed, total: items.length, item, result }); }
                    catch (e) { console.warn('[ParallelProcessor] onProgress error:', e.message); }
                }
                return result;
            });

            executing.add(wrappedPromise);
            results.push(wrappedPromise);

            if (executing.size >= concurrency) await Promise.race(executing);
            if (delayBetweenItems > 0 && i < items.length - 1) await this._sleep(delayBetweenItems);
        }

        return Promise.all(results);
    }

    /**
     * Process items in batches with checkpoint callback after each batch
     */
    async processInBatches(items, processFn, options = {}) {
        const { batchSize = 10, concurrency = 5, delayBetweenBatches = 1000, onBatchComplete = null } = options;

        const allResults = [];
        const batches = this._chunk(items, batchSize);

        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
            const batch = batches[batchIndex];
            console.log(`[ParallelProcessor] Batch ${batchIndex + 1}/${batches.length} (${batch.length} items)`);
            
            const batchResults = await this.process(batch, processFn, { concurrency });
            allResults.push(...batchResults);

            if (onBatchComplete) {
                try { await onBatchComplete({ batchIndex, batchResults, totalBatches: batches.length }); }
                catch (e) { console.warn('[ParallelProcessor] onBatchComplete error:', e.message); }
            }

            if (delayBetweenBatches > 0 && batchIndex < batches.length - 1) await this._sleep(delayBetweenBatches);
        }

        return allResults;
    }

    /** Summarize processing results */
    summarize(results) {
        const fulfilled = results.filter(r => r.status === 'fulfilled');
        const rejected = results.filter(r => r.status === 'rejected');
        return {
            total: results.length,
            succeeded: fulfilled.length,
            failed: rejected.length,
            successRate: results.length > 0 ? (fulfilled.length / results.length * 100).toFixed(1) + '%' : '0%',
            errors: rejected.map(r => ({ item: r.item, index: r.index, error: r.reason?.message || String(r.reason) }))
        };
    }

    _chunk(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size));
        return chunks;
    }

    _sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
}

module.exports = new ParallelProcessor();
