declare module 'jspdf' {
  interface jsPDFOptions {
    orientation?: 'portrait' | 'landscape'
    unit?: 'pt' | 'mm' | 'cm' | 'in' | 'px'
    format?: string | [number, number]
  }
  class jsPDF {
    constructor(options?: jsPDFOptions)
    addImage(imageData: string, format: string, x: number, y: number, w: number, h: number): this
    save(filename: string): this
  }
  export { jsPDF }
}
