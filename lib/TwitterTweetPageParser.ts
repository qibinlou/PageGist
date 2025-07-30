'use client'

export default class TwitterTweetPageParser {
  static parse(html: string): Array<string> {
    const tweets: Array<string> = []
    const parser = new DOMParser()
    const document = parser.parseFromString(html, 'text/html')

    const tweetElements = document.querySelectorAll('[data-testid="tweet"]')
    tweetElements.forEach(tweet => {
      tweets.push(tweet.textContent || '')
    })
    return tweets
  }
}
