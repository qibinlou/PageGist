import { Readability } from "@mozilla/readability"

// Make Readability available globally for the popup script injection
;(window as any).Readability = Readability
