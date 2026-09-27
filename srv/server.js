/**
 * Custom CAP server configuration
 */
const cds = require('@sap/cds');
const path = require('path');

// Increase payload limit for attachment uploads
cds.on('bootstrap', (app) => {
    const express = require('express');
    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ limit: '50mb', extended: true }));

    // Serve the React UI from app/migration-ui/dist in development
    // In production, the approuter handles this
    if (process.env.NODE_ENV !== 'production') {
        const uiPath = path.join(__dirname, '..', 'app', 'migration-ui', 'dist');
        
        // Serve static files
        app.use('/ui', express.static(uiPath));
        
        // Redirect root to UI
        app.get('/', (req, res) => {
            res.redirect('/ui/');
        });
        
        // SPA fallback - serve index.html for any unmatched routes under /ui
        app.get('/ui/*', (req, res, next) => {
            const fs = require('fs');
            const indexPath = path.join(uiPath, 'index.html');
            if (fs.existsSync(indexPath)) {
                res.sendFile(indexPath);
            } else {
                next();
            }
        });
        
        console.log(`[server] UI available at /ui (serving from ${uiPath})`);
    }
});

module.exports = cds.server;
