// Type definitions for jsreport-core 1.5
// Project: http://jsreport.net
// Definitions by: taoqf <https://github.com/taoqf>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped
// TypeScript Version: 2.3

/// <reference types="node" />

declare namespace JsReport {
	type helpers = string | { [fun: string]: (...args: any[]) => any };

	interface RenderOptions {
		template: {
			content: string;
			engine: 'jsrender' | 'handlebars' | 'ejs' | 'jade' | string;
			helpers?: helpers;
			recipe: 'phantom-pdf' | 'electron-pdf' | 'text' | 'xlsx' | 'html-to-xlsx' | 'phantom-image' | 'html-to-text' | 'fop-pdf' | 'client-html' | 'wrapped-html' | 'wkhtmltopdf' | string;
		};
		data?: any;
	}

	interface Report {
		content: Buffer;
		stream: NodeJS.ReadableStream;
		headers: {
			[header: string]: string | number | boolean;
		};
	}

	interface Request {
		template: {
			content: string;
		};
	}

	// interface Response {
	// 	// todo
	// }

	type Response = any;

	interface Listener {
		add(type: string, callback: (req: Request, res: Response, err: any) => void): void;
	}

	interface Logger {
		add(logger: any, options?: {
			level: 'debug' | 'info' | 'log' | 'warn' | 'error';
		}): void;
	}

	interface Collection {
		find(query: {
			[field: string]: any;
		}): Promise<any>;
	}

	interface DocumentStore {
		collection(options: string): Collection;
	}

	interface JsReporter {
		afterRenderListeners: JsReport.Listener;
		afterTemplatingEnginesExecutedListeners: JsReport.Listener;
		beforeRenderListeners: JsReport.Listener;
		documentStore: JsReport.DocumentStore;
		initializeListeners: JsReport.Listener;
		logger: JsReport.Logger;
		validateRenderListeners: JsReport.Listener;
		init(): Promise<void>;
		render(options: JsReport.RenderOptions): Promise<JsReport.Report>;
		use(extension: any): any;
	}
}

declare function JsReport(options?: Partial<{
	autoTempCleanup: boolean;
	dataDirectory: string;
	extensionsLocationCache: boolean;
	loadConfig: boolean;
	logger: {
		silent: boolean;
	};
	rootDirectory: string;
	scripts: {
		allowedModules: string[];
	};
	tasks: {
		[task: string]: any;
	};
	tempDirectory: string;
}>): JsReport.JsReporter;

declare module 'jsreport-core' {
	export = JsReport;
}
