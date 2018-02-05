/// <reference types='jsreport-core' />
/// <reference types='jsreport-xlsx' />

declare namespace JsReport {
  const enum RecipeType {
    Xlsx = 'xlsx'
  }

  interface Html2Xlsx {
    shortid: string;
  }

  interface Template {
    xlsxTemplate: Partial<Html2Xlsx>;
  }
}

declare namespace JsReportHtml2Xlsx {
  interface Options extends JsReportXlsx.Options {
    strategy: string;
  }
}

declare function JsReportHtml2Xlsx(options?: Partial<JsReportHtml2Xlsx.Options>): JsReport.Recipe;

declare module 'jsreport-html-to-xlsx' {
  export = JsReportHtml2Xlsx;
}
