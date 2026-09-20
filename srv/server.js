/**
 * Custom CAP server configuration
 */
const cds = require('@sap/cds');

// Increase payload limit for attachment uploads
cds.on('bootstrap', (app) => {
    const express = require('express');
    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ limit: '50mb', extended: true }));
});

module.exports = cds.server;
