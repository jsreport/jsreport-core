/// <reference types='jsreport-core' />

declare namespace JsReport {
  const enum EngineType {
    JsRender = 'jsrender'
  }
}

declare namespace JsReportJsrender {
}

declare function JsReportJsrender(): JsReport.Recipe;

declare module 'jsreport-jsrender' {
  export = JsReportJsrender;
}
