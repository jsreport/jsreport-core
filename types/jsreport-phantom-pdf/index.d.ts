// Type definitions for jsreport-core 1.5
// Project: http://jsreport.net
// Definitions by: taoqf <https://github.com/taoqf>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped
// TypeScript Version: 2.3

/// <reference types="node" />

declare namespace JsReport {
  enum Recipe {
    PhantomPdf = "phantom-pdf"
  }

  interface Phantom {
    header: string,
    footer: string
  }

  interface Template {
    phantom: Partial<Phantom> | object
  }
}

declare namespace JsReportPhantomPdf {

}

declare function JsReportPhantomPdf(): (
  reporter: JsReport.Reporter,
  definition: object
) => any;

declare module "jsreport-phantom-pdf" {
  export = JsReportPhantomPdf;
}
