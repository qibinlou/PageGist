"use client"

import MarkdownParser from "./MarkdownParser"
import type Parser from "./Parser"
import ReadbilityParser from "./ReadbilityParser"

export default class XiaohongshuParser implements Parser {
  static getInstance(): XiaohongshuParser {
    return new XiaohongshuParser()
  }

  parse(input: string): string {
    try {
      return XiaohongshuParser._parsePostPage(input)
    } catch (error) {
      console.error(
        "XiaohongshuParser failed, falling back to ReadbilityParser:",
        error
      )
      throw new Error("XiaohongshuParser failed")
    }
  }

  static _parsePostPage(html: string): string {
    // console.debug("Parsing with XiaohongshuParser", html)

    // Use ReadabilityParser to extract main content from the HTML (like Reddit)
    const result = ReadbilityParser.getInstance().parse(html, {
      baseUrl: "https://www.xiaohongshu.com" // Use XHS's base URL to resolve relative links
    })

    // Parse comments in a separate pass
    const parser = new DOMParser()
    const document = parser.parseFromString(html, "text/html")

    const baseElement = document.createElement("base")
    baseElement.href = "https://www.xiaohongshu.com"
    document.head.appendChild(baseElement)

    // Try to extract comments from common XHS comment selectors
    const commentSelectors = [".comments-container"]

    let commentsAsText = ""
    for (const selector of commentSelectors) {
      const commentsContainer = document.querySelector(selector)
      if (commentsContainer && commentsContainer.textContent) {
        commentsAsText = commentsContainer.textContent
        break
      }
    }

    const markdownContent =
      MarkdownParser.getInstance().parse(result.content) +
      "\n\n" +
      "------\n" +
      `<comments>\n${commentsAsText ? MarkdownParser.getInstance().parse(commentsAsText) : "未找到评论"}\n</comments>`

    return markdownContent
  }
}
