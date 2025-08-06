"use client"

import { Readability } from "@mozilla/readability"

export default class ReadbilityParser {
  static getInstance(): ReadbilityParser {
    return new ReadbilityParser()
  }

  parse(html: string): {
    title: string
    content: string
    byline: string
    excerpt: string
  } {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, "text/html")

    let title = doc.title || ""
    let content = ""
    let byline = ""
    let excerpt = ""

    try {
      // Use Readability to extract main content
      const reader = new Readability(doc, {
        debug: false,
        // charThreshold: 500,
        classesToPreserve: ["highlight", "code", "pre"]
      })

      const article = reader.parse()

      if (article) {
        console.debug("Readability article:", article)
        title = article.title || title
        content = article.content
        byline = article.byline || ""
        excerpt = article.excerpt || ""
      } else {
        console.warn(
          "Readability could not parse the article, falling back to simple extraction."
        )
        // Fallback to simple extraction if Readability fails
        const mainElement = doc.querySelector(
          'main, article, [role="main"], .main-content, .content'
        )
        if (mainElement) {
          content = mainElement.innerHTML
        } else {
          const bodyClone = doc.body?.cloneNode(true) as HTMLElement
          if (bodyClone) {
            const elementsToRemove = (
              bodyClone as HTMLElement
            ).querySelectorAll(
              "nav, header, footer, aside, .sidebar, .nav, .navigation, .menu, script, style"
            )
            elementsToRemove.forEach((el) => el.remove())
            content = (bodyClone as HTMLElement).innerHTML
          }
        }
      }
    } catch (error) {
      console.error("Readability extraction failed:", error)
      throw new Error("Failed to extract content from the page.")
    }

    return {
      title,
      content,
      byline,
      excerpt
    }
  }
}
