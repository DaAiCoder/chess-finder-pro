import * as React from "react";

/**
 * Updates `document.title` while a page is mounted, restoring the previous
 * title on unmount. Useful for per-route SEO titles without pulling in
 * react-helmet.
 *
 * Pass a `description` to also update the meta description tag (creates one
 * if missing). The previous description is restored on unmount.
 */
export function useDocumentTitle(title: string, description?: string): void {
  React.useEffect(() => {
    const prevTitle = document.title;
    document.title = title;

    let descEl: HTMLMetaElement | null = null;
    let prevDesc: string | null = null;
    if (description) {
      descEl = document.querySelector('meta[name="description"]');
      if (descEl) {
        prevDesc = descEl.getAttribute("content");
        descEl.setAttribute("content", description);
      } else {
        descEl = document.createElement("meta");
        descEl.setAttribute("name", "description");
        descEl.setAttribute("content", description);
        document.head.appendChild(descEl);
      }
    }

    return () => {
      document.title = prevTitle;
      if (descEl) {
        if (prevDesc === null) {
          descEl.remove();
        } else {
          descEl.setAttribute("content", prevDesc);
        }
      }
    };
  }, [title, description]);
}
