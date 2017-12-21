import { Buffer } from 'buffer';
import { Readable } from 'stream';

interface RenderOptions {
	template: {
		content: string;
		engine: 'jsrender' | 'handlebars' | 'ejs' | 'jade';
		helpers: string;
		recipe: 'phantom-pdf' | 'electron-pdf' | 'text' | 'xlsx' | 'html-to-xlsx' | 'phantom-image' | 'html-to-text' | 'fop-pdf' | 'client-html' | 'wrapped-html' | 'wkhtmltopdf';
	};
	data?: any;
}

interface Report {
	content: Buffer;
	stream: Readable;
	headers: {
		[header: string]: string | number | boolean;
	};
}

interface Request {
	template: {
		content: string;
	};
}

interface Response {
}

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
	afterRenderListeners: Listener;
	afterTemplatingEnginesExecutedListeners: Listener;
	beforeRenderListeners: Listener;
	documentStore: DocumentStore;
	initializeListeners: Listener;
	logger: Logger;
	validateRenderListeners: Listener;
	init(): Promise<void>;
	render(options: RenderOptions): Promise<Report>;
	use(extension: any): any;
}

interface JsReportStatic {
	(options?: Partial<{
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
	}>): JsReporter;
}

declare module 'jsreport-core' {
	const JsReport: JsReportStatic;
	export = JsReport;
}
