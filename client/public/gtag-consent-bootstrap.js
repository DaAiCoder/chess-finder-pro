/**
 * Consent Mode v2 defaults for gtag (loaded as a normal script so CSP
 * `script-src 'self'` works — avoids inline script hashes and survives
 * multiple CSP headers intersecting to the strictest set).
 */
window.dataLayer = window.dataLayer || [];
function gtag() {
  window.dataLayer.push(arguments);
}
window.gtag = gtag;
gtag("consent", "default", {
  ad_storage: "denied",
  analytics_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
  wait_for_update: 500,
});
gtag("js", new Date());
