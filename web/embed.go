package web

import "embed"

// Dist embeds the frontend single-page application assets.
//
//go:embed index.html
var Dist embed.FS
