import { Readability } from "@mozilla/readability"
import { useEffect, useState } from "react"
import TurndownService from "turndown"

function IndexPopup() {
  const [isLoading, setIsLoading] = useState(false)
  const [markdown, setMarkdown] = useState("")
  const [shareUrl, setShareUrl] = useState("")
  const [error, setError] = useState("")
  const [currentUrl, setCurrentUrl] = useState("")

  useEffect(() => {
    // Get current tab URL
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.url) {
        setCurrentUrl(tabs[0].url)
      }
    })
  }, [])

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

      // Use Readability to extract main content from the HTML
      const parser = new DOMParser()
      const doc = parser.parseFromString(html, "text/html")

      let title = pageTitle
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
          title = article.title || pageTitle
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
              const elementsToRemove = bodyClone.querySelectorAll(
                "nav, header, footer, aside, .sidebar, .nav, .navigation, .menu, script, style"
              )
              elementsToRemove.forEach((el) => el.remove())
              content = bodyClone.innerHTML
            }
          }
        }
      } catch (error) {
        console.error("Readability extraction failed:", error)
        // Fallback to simple extraction
        const mainElement = doc.querySelector(
          'main, article, [role="main"], .main-content, .content'
        )
        if (mainElement) {
          content = mainElement.innerHTML
        } else {
          const bodyClone = doc.body?.cloneNode(true) as HTMLElement
          if (bodyClone) {
            const elementsToRemove = bodyClone.querySelectorAll(
              "nav, header, footer, aside, .sidebar, .nav, .navigation, .menu, script, style"
            )
            elementsToRemove.forEach((el) => el.remove())
            content = bodyClone.innerHTML
          }
        }
      }

      // Convert HTML to Markdown using Turndown
      const turndownService = new TurndownService({
        headingStyle: "atx",
        codeBlockStyle: "fenced"
      })

      // Add custom rules for better markdown conversion
      turndownService.addRule("removeUnwantedElements", {
        filter: ["script", "style", "nav", "footer", "aside"],
        replacement: () => ""
      })

      const markdownContent = `**Source:** ${url}${byline ? `\n**Author:** ${byline}` : ""}${excerpt ? `\n\n**Summary:** ${excerpt}` : ""}
------

# ${title}

${turndownService.turndown(content)}`

      setMarkdown(markdownContent)

      // Generate shareable link using a public paste service
      try {
        // Try dpaste.org first (no API key required)
        const dpasteResponse = await fetch("https://dpaste.org/api/", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded"
          },
          body: new URLSearchParams({
            content: markdownContent,
            title: `${title} - Web Page Content`,
            syntax: "markdown",
            expiry_days: "30"
          })
        })

        if (!dpasteResponse.ok) {
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
                    contents: markdownContent
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
          const encodedMarkdown = btoa(encodeURIComponent(markdownContent))
          const shareableUrl = `data:text/markdown;base64,${encodedMarkdown}`
          setShareUrl(shareableUrl)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred")
    } finally {
      setIsLoading(false)
    }
  }

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
    a.download = "webpage-content.md"
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div
      style={{
        width: 400,
        padding: 20,
        fontFamily: "system-ui, -apple-system, sans-serif",
        fontSize: 14
      }}>
      <div style={{ marginBottom: 20 }}>
        <h2
          style={{ margin: 0, marginBottom: 8, fontSize: 18, fontWeight: 600 }}>
          Web Page Zipper
        </h2>
        <p style={{ margin: 0, color: "#666", fontSize: 12 }}>
          Extract webpage content as markdown
        </p>
      </div>

      {currentUrl && (
        <div
          style={{
            marginBottom: 16,
            padding: 8,
            backgroundColor: "#f5f5f5",
            borderRadius: 4
          }}>
          <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>
            Current page:
          </div>
          <div style={{ fontSize: 12, wordBreak: "break-all" }}>
            {currentUrl}
          </div>
        </div>
      )}

      <button
        onClick={extractContent}
        disabled={isLoading}
        style={{
          width: "100%",
          padding: "12px 16px",
          backgroundColor: isLoading ? "#ccc" : "#007acc",
          color: "white",
          border: "none",
          borderRadius: 6,
          fontSize: 14,
          fontWeight: 500,
          cursor: isLoading ? "not-allowed" : "pointer",
          marginBottom: 16
        }}>
        {isLoading ? "Extracting..." : "Extract Content"}
      </button>

      {error && (
        <div
          style={{
            padding: 12,
            backgroundColor: "#fee",
            border: "1px solid #fcc",
            borderRadius: 4,
            color: "#c33",
            fontSize: 12,
            marginBottom: 16
          }}>
          {error}
        </div>
      )}

      {markdown && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 12 }}>
            <h3
              style={{
                margin: 0,
                marginBottom: 8,
                fontSize: 14,
                fontWeight: 600
              }}>
              Extracted Content
            </h3>
            <div
              style={{
                maxHeight: 200,
                overflow: "auto",
                padding: 8,
                backgroundColor: "#f9f9f9",
                border: "1px solid #ddd",
                borderRadius: 4,
                fontSize: 11,
                fontFamily: "Monaco, monospace",
                whiteSpace: "pre-wrap"
              }}>
              {markdown}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button
              onClick={() => copyToClipboard(markdown)}
              style={{
                flex: 1,
                padding: "8px 12px",
                backgroundColor: "#28a745",
                color: "white",
                border: "none",
                borderRadius: 4,
                fontSize: 12,
                cursor: "pointer"
              }}>
              Copy Markdown
            </button>
            <button
              onClick={downloadMarkdown}
              style={{
                flex: 1,
                padding: "8px 12px",
                backgroundColor: "#6c757d",
                color: "white",
                border: "none",
                borderRadius: 4,
                fontSize: 12,
                cursor: "pointer"
              }}>
              Download
            </button>
          </div>

          {shareUrl && (
            <div>
              <h4
                style={{
                  margin: 0,
                  marginBottom: 8,
                  fontSize: 12,
                  fontWeight: 600
                }}>
                Shareable Link:
              </h4>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={shareUrl}
                  readOnly
                  style={{
                    flex: 1,
                    padding: "6px 8px",
                    border: "1px solid #ddd",
                    borderRadius: 4,
                    fontSize: 11,
                    backgroundColor: "#f9f9f9"
                  }}
                />
                <button
                  onClick={() => copyToClipboard(shareUrl)}
                  style={{
                    padding: "6px 12px",
                    backgroundColor: "#17a2b8",
                    color: "white",
                    border: "none",
                    borderRadius: 4,
                    fontSize: 11,
                    cursor: "pointer"
                  }}>
                  Copy
                </button>
              </div>
              <p style={{ margin: "8px 0 0 0", fontSize: 10, color: "#666" }}>
                This link hosts the markdown content on a public paste service
                and can be easily shared with AI assistants like ChatGPT or
                Gemini.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default IndexPopup
