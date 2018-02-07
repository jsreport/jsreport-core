/// <reference types='jsreport-core' />
/// <reference types='jsreport-xlsx' />

declare namespace JsReport {
	const enum Recipe {
		Html2Xlsx = 'html-to-xlsx'
	}
}

declare namespace JsReportHtml2Xlsx {
	interface Options extends JsReportXlsx.Options {
		strategy: string;
	}

	// without exporting enum, it doesn't include the require('jsreport-core') in the test.js for some reason
	// help welcome
	export enum Foo { }
}

declare function JsReportHtml2Xlsx(options?: Partial<JsReportHtml2Xlsx.Options>): JsReport.ExtensionDefinition;

declare module 'jsreport-html-to-xlsx' {
	export = JsReportHtml2Xlsx;
}
