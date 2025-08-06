import type Parser from "./Parser";
import TurndownService from "turndown";

"use client";


export default class MarkdownParser implements Parser {
  private turndownService: TurndownService;

  constructor() {
    // Convert HTML to Markdown using Turndown
    this.turndownService = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced"
    });

    // Add custom rules for better markdown conversion
    this.turndownService.addRule("removeUnwantedElements", {
      filter: ["script", "style", "nav", "footer", "aside"],
      replacement: () => ""
    });
  }

  static getInstance(): MarkdownParser {
    return new MarkdownParser();
  }

  parse(input: string): string {
    return this.turndownService.turndown(input);
  }
}