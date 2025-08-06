"use client"

import type Parser from "./Parser"

export default class TwitterTweetPageParser implements Parser {
  static getInstance(): TwitterTweetPageParser {
    return new TwitterTweetPageParser()
  }

  parse(input: string): string {
    const tweets = TwitterTweetPageParser._parse(input)
    return tweets.join("\n")
  }

  static _parse(html: string): Array<string> {
    const tweets: Array<string> = []
    const parser = new DOMParser()
    const document = parser.parseFromString(html, "text/html")

    const tweetElements = document.querySelectorAll('[data-testid="tweet"]')
    tweetElements.forEach((tweet) => {
      tweets.push(tweet.textContent || "")
    })
    return tweets
  }
}
