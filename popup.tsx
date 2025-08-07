import { Copy, Download, FileText, RefreshCw, Share } from "lucide-react"
import { useEffect, useState } from "react"

import { Alert, AlertDescription } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "~/components/ui/card"
import { Input } from "~/components/ui/input"
import TwitterTweetPageParser from "~lib/parsers/TwitterTweetPageParser"

import "~/globals.css"

import MarkdownParser from "~lib/parsers/MarkdownParser"
import ReadbilityParser from "~lib/parsers/ReadbilityParser"
import RedditParser from "~lib/parsers/RedditParser"
import XiaohongshuParser from "~lib/parsers/XiaoHongShuParser"

function IndexPopup() {
  const [isLoading, setIsLoading] = useState(false)
  const [isGeneratingShareLink, setIsGeneratingShareLink] = useState(false)
  const [markdown, setMarkdown] = useState("")
  const [shareUrl, setShareUrl] = useState("")
  const [error, setError] = useState("")
  const [currentUrl, setCurrentUrl] = useState("")

  const extractContent = async () => {
    try {
      setIsLoading(true)
      setError("")
      setMarkdown("")
      setShareUrl("")

      // Get current active tab
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
      })

      if (!tab.id) {
        throw new Error("No active tab found")
      }

      // Get the page HTML content first
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          return {
            html: document.documentElement.outerHTML,
            url: window.location.href,
            title: document.title
          }
        }
      })

      if (!results || !results[0]?.result) {
        throw new Error("Failed to extract content from the page")
      }

      const { html, url, title: pageTitle } = results[0].result

      // Check if we're on X.com (Twitter) and use specialized parser
      const urlObj = new URL(url)
      const isTwitter =
        urlObj.hostname === "x.com" || urlObj.hostname === "twitter.com"

      const isReddit = urlObj.hostname.includes("reddit.com")
      const isXhs = urlObj.hostname.includes("xiaohongshu.com")

      let title = pageTitle
      let content = ""
      let contentAsText = null
      let byline = ""
      let excerpt = ""

      if (isTwitter) {
        console.debug(
          "Detected Twitter/X.com page, using TwitterTweetPageParser"
        )
        try {
          const tweetsText = TwitterTweetPageParser.getInstance().parse(html)
          title = `Tweets from ${pageTitle}`

          // Use the parsed tweets text directly
          if (tweetsText && tweetsText.trim()) {
            contentAsText = tweetsText
            const tweetCount = tweetsText
              .split("\n")
              .filter((line) => line.trim()).length
            excerpt = `Extracted ${tweetCount} tweet(s)`
          } else {
            contentAsText = "No tweets found on this page."
            excerpt = "No tweets found"
          }
        } catch (error) {
          console.error("TwitterTweetPageParser failed:", error)
          contentAsText = null
        }
      }

      if (isReddit) {
        console.debug("Detected Reddit page, using RedditParser")
        try {
          const redditContent = RedditParser.getInstance().parse(html)
          contentAsText = redditContent
        } catch (error) {
          console.error("RedditParser failed:", error)
          contentAsText = null
        }
      }

      if (isXhs) {
        console.debug("Detected XiaoHongShu page, using XiaohongshuParser")
        try {
          const xhsContent = XiaohongshuParser.getInstance().parse(html)
          contentAsText = xhsContent
        } catch (error) {
          console.error("XiaohongshuParser failed:", error)
          contentAsText = null
        }
      }

      // Use ReadbilityParser to extract main content from the HTML
      const result = ReadbilityParser.getInstance().parse(html, {
        baseUrl: url
      })
      title = title || result.title || pageTitle
      content = content || result.content
      byline = byline || result.byline
      excerpt = excerpt || result.excerpt

      if (isXhs) {
        byline = byline.replace("关注", "")
        excerpt = null
      }

      const markdownContent = `**Source:** ${url}${byline ? `\n**Author:** ${byline}` : ""}${excerpt ? `\n\n**Summary:** ${excerpt}` : ""}\n
------

# ${title}

${contentAsText ?? MarkdownParser.getInstance().parse(content)}`

      setMarkdown(markdownContent)
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  const generateShareLink = async () => {
    if (!markdown) return

    try {
      setIsGeneratingShareLink(true)
      setError("")

      // Get the title from the markdown content
      const titleMatch = markdown.match(/# (.+)/)
      const title = titleMatch ? titleMatch[1] : "Web Page Content"

      // Generate shareable link using a public paste service
      try {
        // Try dpaste.org first (no API key required)
        const dpasteResponse = await fetch("https://dpaste.org/api/", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded"
          },
          body: new URLSearchParams({
            content: markdown,
            title: `${title} - Web Page Content`,
            syntax: "markdown",
            expiry_days: "30"
          })
        })

        if (dpasteResponse.ok) {
          const dpasteUrl = await dpasteResponse.text()
          if (dpasteUrl.trim().includes("https://dpaste.org/")) {
            let shareableUrl = dpasteUrl.trim()
            shareableUrl =
              shareableUrl.substring(1, shareableUrl.length - 1) + "/raw" // Remove surrounding quotes
            setShareUrl(shareableUrl)
          } else {
            throw new Error("Invalid dpaste response")
          }
        } else {
          throw new Error(`dpaste API error: ${dpasteResponse.status}`)
        }
      } catch (dpasteError) {
        console.warn("Failed to create dpaste link:", dpasteError)

        // Fallback: try paste.ee (also no API key required)
        try {
          const pasteeeResponse = await fetch(
            "https://api.paste.ee/v1/pastes",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                description: `${title} - Web Page Content`,
                sections: [
                  {
                    name: "content",
                    syntax: "markdown",
                    contents: markdown
                  }
                ]
              })
            }
          )

          if (pasteeeResponse.ok) {
            const pasteeeData = await pasteeeResponse.json()
            if (pasteeeData.link) {
              setShareUrl(pasteeeData.link)
            } else {
              throw new Error("No link in paste.ee response")
            }
          } else {
            throw new Error(`paste.ee API error: ${pasteeeResponse.status}`)
          }
        } catch (pasteeeError) {
          console.warn("Failed to create paste.ee link:", pasteeeError)

          // Final fallback to base64 data URL
          const encodedMarkdown = btoa(encodeURIComponent(markdown))
          const shareableUrl = `data:text/markdown;base64,${encodedMarkdown}`
          setShareUrl(shareableUrl)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred")
    } finally {
      setIsGeneratingShareLink(false)
    }
  }

  useEffect(() => {
    // Get current tab URL and auto-extract content when popup opens
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.url) {
        setCurrentUrl(tabs[0].url)
        // Automatically extract content when popup opens
        extractContent()
      }
    })
  }, [])

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      // Could add a toast notification here
    } catch (err) {
      console.error("Failed to copy to clipboard:", err)
    }
  }

  const downloadMarkdown = () => {
    const blob = new Blob([markdown], { type: "text/markdown" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `webpage-content-zip-${new Date().toISOString()}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="w-[400px] min-h-[600px] max-h-[800px] p-5 bg-background text-foreground overflow-y-auto">
      <CardHeader className="px-0 pb-5">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Web Page Zipper</CardTitle>
        </div>
        <CardDescription>Extract webpage content as markdown</CardDescription>
      </CardHeader>

      {currentUrl && (
        <Card className="mb-4">
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground mb-1">
              Current page:
            </div>
            <div className="text-sm break-all">{currentUrl}</div>
          </CardContent>
        </Card>
      )}

      <Button
        onClick={extractContent}
        disabled={isLoading}
        className="w-full mb-4"
        size="lg">
        {isLoading ? (
          <>
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            Extracting...
          </>
        ) : (
          <>
            <RefreshCw className="mr-2 h-4 w-4" />
            Re-extract Content
          </>
        )}
      </Button>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {markdown && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Extracted Content</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-48 overflow-auto p-3 bg-muted rounded-md border text-xs font-mono whitespace-pre-wrap">
                {markdown}
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <Button
              onClick={() => copyToClipboard(markdown)}
              variant="outline"
              size="sm"
              className="flex-1 hover:bg-blue-300">
              <Copy className="mr-2 h-3 w-3" />
              Copy
            </Button>
            <Button
              onClick={downloadMarkdown}
              variant="outline"
              size="sm"
              className="flex-1 hover:bg-blue-300">
              <Download className="mr-2 h-3 w-3" />
              Download
            </Button>
            <Button
              onClick={generateShareLink}
              disabled={isGeneratingShareLink}
              variant="outline"
              size="sm"
              className="flex-1 hover:bg-green-300">
              {isGeneratingShareLink ? (
                <>
                  <RefreshCw className="mr-2 h-3 w-3 animate-spin" />
                  Sharing...
                </>
              ) : (
                <>
                  <Share className="mr-2 h-3 w-3" />
                  Share
                </>
              )}
            </Button>
          </div>

          {shareUrl && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs">Shareable Link:</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2 mb-2">
                  <Input
                    value={shareUrl}
                    readOnly
                    className="text-xs bg-muted"
                  />
                  <Button
                    onClick={() => copyToClipboard(shareUrl)}
                    variant="outline"
                    size="sm">
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  This link hosts the markdown content on a public paste service
                  and can be easily shared with AI assistants like ChatGPT or
                  Gemini.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

export default IndexPopup
