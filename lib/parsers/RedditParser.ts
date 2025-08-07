"use client"

import MarkdownParser from "./MarkdownParser"
import type Parser from "./Parser"
import ReadbilityParser from "./ReadbilityParser"

export default class RedditParser implements Parser {
  static getInstance(): RedditParser {
    return new RedditParser()
  }

  parse(input: string): string {
    return RedditParser._parsePostPage(input)
  }

  static _parsePostPage(html: string): string {
    const result = ReadbilityParser.getInstance().parse(html, {
      baseUrl: "https://www.reddit.com" // Use Reddit's base URL to resolve relative links
    })

    // extract comments
    const parser = new DOMParser()
    const document = parser.parseFromString(html, "text/html")

    const commentsContainer = document.querySelector("shreddit-comment-tree")
    // @ts-ignore
    const commentsAsText = commentsContainer?.innerText

    const markdownContent =
      MarkdownParser.getInstance().parse(result.content) +
      "\n\n" +
      "------\n" +
      `<comments>\n${MarkdownParser.getInstance().parse(commentsAsText)}\n</comments>`

    return markdownContent
  }
}
