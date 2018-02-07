/// <reference types='jsreport-core' />

declare namespace JsReport {
  const enum Recipe {
    PhantomPdf = 'phantom-pdf'
  }

  interface Margin {
    left: number | string;
    right: number | string;
    top: number | string;
    bottom: number | string;
  }

  interface Phantom {
    margin: string | Margin;
    header: string;
    footer: string;
    width: string;
    height: string;
    headerHeight: string;
    footerHeight: string;
    format: string;
    orientation: 'portrait' | 'landscape';
    blockJavaScript: boolean;
    resourceTimeout: number;
    waitForJS: boolean;
    fitToPage: boolean;
    customPhantomJS: boolean;
    phantomjsVersion: string;
  }

  interface Template {
    phantom?: Partial<Phantom>;
  }
}

declare namespace JsReportPhantomPdf {
  const enum PhantomStrategy {
    dedicatedProcess = 'dedicated-process',
    phantomServer = 'phantom-server'
  }

  interface Options {
    allowLocalFilesAccess: boolean;
    // appDirectory: string;
    defaultPhantomjsVersion: string;
    strategy: PhantomStrategy;
    timeout: number;
  }

  // without exporting enum, it doesn't include the require('jsreport-core') in the test.js for some reason
  // help welcome
  export enum Foo { }
}

declare function JsReportPhantomPdf(options?: Partial<JsReportPhantomPdf.Options>): JsReport.ExtensionDefinition;

declare module 'jsreport-phantom-pdf' {
  export = JsReportPhantomPdf;
}
