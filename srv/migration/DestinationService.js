/**
 * DestinationService - Resolves external system credentials from BTP Destination Service
 *
 * Priority order:
 *   1. BTP Destination Service (production - when VCAP_SERVICES is bound)
 *   2. process.env direct variables (local development fallback)
 *
 * BTP Destinations to configure in Cockpit → Connectivity → Destinations:
 *   V1_C4C   - C4C V1 system  (Type: HTTP, Auth: BasicAuthentication)
 *   V2_SSCV2 - SSC V2 system  (Type: HTTP, Auth: BasicAuthentication)
 */

const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

// In-memory cache: avoids re-fetching the same destination on every migration tick
// TTL: 5 minutes
const _cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Parse VCAP_SERVICES to find the Destination Service binding credentials
 */
function _getDestinationServiceCreds() {
    try {
        const vcap = process.env.VCAP_SERVICES;
        if (!vcap) return null;
        const services = JSON.parse(vcap);
        const binding = (services['destination'] || [])[0];
        return binding ? binding.credentials : null;
    } catch {
        return null;
    }
}

/**
 * Obtain OAuth2 client-credentials token for the Destination Service API
 */
async function _getToken(creds) {
    const params = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: creds.clientid,
        client_secret: creds.clientsecret
    });
    const res = await fetch(`${creds.url}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
    });
    if (!res.ok) throw new Error(`Token request failed: HTTP ${res.status}`);
    const data = await res.json();
    return data.access_token;
}

/**
 * Call BTP Destination Service REST API to get a named destination
 */
async function _fetchFromBTP(destinationName, creds) {
    const token = await _getToken(creds);
    const url = `${creds.uri}/destination-configuration/v1/destinations/${destinationName}`;
    console.log(`[DestinationService] Fetching '${destinationName}' from BTP`);
    const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Destination '${destinationName}' not found: HTTP ${res.status}: ${text}`);
    }
    return await res.json();
}

/**
 * Normalise raw BTP destination payload → { baseUrl, user, password }
 */
function _parse(dest) {
    const cfg = dest.destinationConfiguration || dest;
    return {
        baseUrl: (cfg.URL || cfg.url || '').replace(/\/$/, ''),
        user:    cfg.User || cfg.user || '',
        password: cfg.Password || cfg.password || ''
    };
}

/**
 * Resolve credentials for a named BTP destination.
 */
async function resolveDestination(destinationName, envFallback = {}) {
    // 1. Cache hit
    const cached = _cache.get(destinationName);
    if (cached && (Date.now() - cached.fetchedAt) < CACHE_TTL_MS) {
        return cached.credentials;
    }

    // 2. BTP Destination Service (production)
    const svcCreds = _getDestinationServiceCreds();
    if (svcCreds) {
        try {
            const raw = await _fetchFromBTP(destinationName, svcCreds);
            const credentials = _parse(raw);
            if (!credentials.baseUrl) throw new Error(`Destination '${destinationName}' has no URL`);
            console.log(`[DestinationService] '${destinationName}' → ${credentials.baseUrl} (BTP)`);
            _cache.set(destinationName, { credentials, fetchedAt: Date.now() });
            return credentials;
        } catch (err) {
            console.error(`[DestinationService] BTP lookup failed for '${destinationName}': ${err.message}`);
        }
    }

    // 3. Local .env fallback
    const baseUrl = (process.env[envFallback.baseUrl] || '').replace(/\/$/, '');
    const user     = process.env[envFallback.user]     || '';
    const password = process.env[envFallback.password] || '';

    if (baseUrl) {
        console.log(`[DestinationService] '${destinationName}' → ${baseUrl} (.env fallback)`);
        return { baseUrl, user, password };
    }

    throw new Error(
        `Cannot resolve destination '${destinationName}'. ` +
        `On BTP: add a destination named '${destinationName}' in BTP Cockpit → Connectivity. ` +
        `Locally: set ${JSON.stringify(envFallback)} in .env`
    );
}

/** Clear destination cache */
function clearCache() { _cache.clear(); }

module.exports = { resolveDestination, clearCache };
