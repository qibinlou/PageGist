export default interface Parser {
  parse(input: string, options?: {
    outputFormat?: "markdown" | "xml"
  }): string
}
