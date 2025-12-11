// routes/csrf.js
// CSRF Token Routes

export function setupCsrfRoutes(app, dependencies) {
  const {
    csrfTokens,
    CSRF_TOKEN_TTL,
    generateCSRFToken,
  } = dependencies;

  // ----------------------
  // CSRF Token Endpoint
  // ----------------------

  /**
   * Get CSRF token
   * GET /api/csrf-token
   */
  app.get("/api/csrf-token", (req, res) => {
    const token = generateCSRFToken();
    const expiresAt = Date.now() + CSRF_TOKEN_TTL;
    csrfTokens.set(token, expiresAt);
    
    // Clean up expired tokens
    for (const [t, exp] of csrfTokens.entries()) {
      if (Date.now() > exp) {
        csrfTokens.delete(t);
      }
    }
    
    return res.json({
      ok: true,
      token: token,
      expiresAt: expiresAt,
    });
  });
}
























