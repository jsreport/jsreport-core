# jsreport-core
[![NPM Version](http://img.shields.io/npm/v/jsreport-core.svg?style=flat-square)](https://npmjs.com/package/jsreport-core)
[![Build Status](https://travis-ci.org/jsreport/jsreport-core.png?branch=master)](https://travis-ci.org/jsreport/jsreport-core)

**The minimalist [jsreport](http://jsreport.net) rendering core.**
Full distribution can be found in [jsreport/jsreport](https://github.com/jsreport/jsreport) repository.

[jsreport](http://jsreport.net) is platform providing dynamic documents assembling and printing. It supports various document types or printing techniques.

`jsreport-core` contains the jsreport rendering core which is useless alone. It is up to you which extensions from the [long list](#list-of-extensions) you additionally apply and which document printing techniques you use.

## Quick example

To generate a document using jsreport you always need a javascript templating engine. The **engine** is used to dynamically assemble the document based on the input values. For start lets pick [jsreport-jsrender](https://github.com/jsreport/jsreport-jsrender) engine from the [list](#engines) and install it using npm.

Next to the engine you need also something we call **recipe**. Recipe represents the technique which is used to print the document. This can be html to pdf conversion, excel rendering and others. In this example lets pick [jsreport-phantom-pdf](https://github.com/jsreport/jsreport-phantom-pdf) from the [list](#engines) of supported recipes.  This recipe implements html to pdf conversion using [phantomjs](https://github.com/ariya/phantomjs). So in this example we use jsrender to assemble html based on the input data and then print the output into final pdf.

Note that `jsreport-core` by default auto discovers installed extensions and apply them. In other words it is enough to just install following packages and there is no need for other configuration.

>npm install jsreport-core<br/>
>npm install jsreport-jsrender<br/>
>npm install jsreport-phantom-pdf

```js
var jsreport = require('jsreport-core')()

jsreport.init().then(function () {     
   return jsreport.render({
	   template: {
		   content: '<h1>Hello {{:foo}}</h1>',
		   engine: 'jsrender',
		   recipe: 'phantom-pdf'
		},
		data: {
			foo: "world"
		}
	}).then(function(resp) {
	 //prints pdf with headline Hello world
     console.log(resp.content.toString())
   });
}).catch(function(e) {
  console.log(e)
})
```

## Render
`render` is the main method which invokes report generation. The only parameter is an object representing rendering request. The request has following structure:
```js
{
	//[required definition of the document]
    template: {
	    //[required] templating engine used to assemble document
	    engine: "handlebars",
	    //[required] recipe used for printing previously assembled document
		recipe: "wkhtmltopdf",
		//[required] template for the engine		
		content: "<h1>{{:foo}}</h1>",
		//javascript helper functions used by templating engines
		helpers: "function foo() { ...}" +
				 "function foo2() { ... }"
		//any other settings used by recipes		 
		...		 
	},
	//dynamic data inputs used by templating engines
    data: { foo: "hello world"}
    ...
}
```

The render returns promise with the single response value
```js
{
	//node.js buffer with the document
	content: ...
	//stream with the document
	stream: ...
	//http response headers with valid content type..
	headers: { ... }
}
```

The convention is that jsreport repository extension  starts with `jsreport-xxx`, but the extension real name and also the recipes or engines it registers excludes the `jsreport-` prefix. This means if you install extension `jsreport-handlebars` the engine's name you specify in the render should be `handlebars`.

### Native helpers
By default you need to send helpers to the template in the string. This is because jsreport runs the template rendering by default in the external process to avoid freezing the application when there is an endless loop or other critical error in the helper. If you want to use your local functions for the helpers you need to switch rendering strategy to `in-process`.
```js
var jsreport = require('jsreport-core')(
   { tasks: { strategy: 'in-process' } })

jsreport.init().then(function() {
 return  jsreport.render({
	   template: {
		   content: '<h1>Hello {{:~foo())}}</h1>',
		   helpers: { foo: function() { }
		   engine: 'jsrender',
		   recipe: 'phantom-pdf'
		}
   })
})
```

### Require in the helpers
jsreport by default runs helpers in the sandbox where is the `require` function blocked. To unblock particular modules or local scripts you need to configure `tasks.allowedModules` option.

```js
var jsreport = require('jsreport-core')(
   { tasks: { allowedModules: ['moment'] } })

//or unblock everything

var jsreport = require('jsreport-core')(
   { tasks: { allowedModules: '*' } })
```

Additionally jsreport provides global variables which can be used to build the local script path and read it.

```js
var jsreport = require('jsreport-core')(
   { tasks: { allowedModules: '*' } })

jsreport.init().then(function() {
  return jsreport.render({
	   template: {
		   content: '<script>{{:~jquery()}}</script>',
		   helpers: "function jquery() {" +
		     "var fs = require('fs');" +
		     "var path = require('path');" +
             "return fs.readFileSync(path.join(__rootDirectory, 'jquery.js'));" +
           "}",
		   engine: 'jsrender',
		   recipe: 'phantom-pdf'
		}
   })
})
```

The following variables are available in the global scope:

`__rootDirectory` - two directories up from jsreport-core
`__appDirectory` - directory of the script which is used when starting node
`__parentModuleDirectory` - directory of script which was initializing jsreport-core



## Extensions
As you see in the first example. Even for the simplest pdf printing you need to install additional packages(extensions).  This is the philosophy of jsreport and you will need to install additional extensions very often. There are not just extensions adding support for a particular templating engine or printing technique. There are many extensions adding support for persisting templates, dynamic script evaluation or even visual html designer and API. To get the idea of the whole platform you can install the full [jsreport](http://jsreport.net/) distribution and pick what you like. Then you can go back to `jsreport-core` and install extensions you need.

You are also welcome to write your own extension or even publish it to the community. See the following articles how to get started.

- [Implementing custom jsreport extension](http://jsreport.net/learn/custom-extension)
- [Implementing custom jsreport recipe](http://jsreport.net/learn/custom-recipe)
- [Implementing custom jsreport engine](http://jsreport.net/learn/custom-engine)

## Extensions auto discovery

jsreport by default auto discovers extensions in the application's directory tree. This means jsreport by default searches for files `jsreport.config.js` which describes the extensions and applies all the extensions that are found.

jsreport extensions auto discovery slows down the startup and can be explicitly overrided using `use` function.

```js
var jsreport = require('jsreport-core')({...})
jsreport.use(require('jsreport-phantom-pdf')())
jsreport.use(require('jsreport-jsrender')())
jsreport.init()
```

## Configuration

jsreport accepts options as the first parameter. The core options are the following:
```js
require('jsreport-core')({
	//optionally specifies where's the application root and where jsreport searches for extensions
	rootDirectory: path.join(__dirname, '../../'),
	//optionally specifies absolute path to directory where the application stores images, reports and database files
	dataDirectory: path.join(rootDirectory, 'data').
	//optionally specifies where the application stores temporary diles
	tempDirectory: path.join(dataDirectory, 'temp'),
  //options for logging
  logger: {
		silent: false // when true, it will silence all transports defined in logger
	},
	//options for templating engines and other scripts execution
	//see the https://github.com/pofider/node-script-manager for more information
	tasks: {
		numberOfWorkers: 2,
		strategy: "http-server | dedicated-process",
		templateCache: {
		   max: 100, //LRU cache with max 100 entries, see npm lru-cache for other options
		   enabled: true //disable cache
		}
	},
	loadConfig: false,
	//the temporary files used to render reports are cleaned up by default
	autoTempCleanup: true,
	//set to false when you want to always force crawling node_modules when searching for extensions and starting jsreport
	extensionsLocationCache: true
})
```

`jsreport-core` is also able to load configuration from other sources including configuration file, environment variables and command line parameters. This can be opted in through option `loadConfig:true`. If this option is set to true the configuration is merged from the following sources in the particular order:

1. configuration file prod.config.json or dev.config.json based on the NODE_ENV
2. command line arguments
3. process environment variables
4. options passed directly to `require('jsreport')({})`

Options with the name corresponding to the extension's name are forwarded to the particular extension. This is the common way how to globally configure all extensions at one place.
```js
require('jsreport-core')({
    ...
	"scripts": {
	  "allowedModules": ["url"]
	}
})
```
You can find configuration notes for the full jsreport distribution [here](http://jsreport.net/learn/configuration).

## Logging
jsreport leverages [winston](https://github.com/winstonjs/winston) logging abstraction together with [debug](https://github.com/visionmedia/debug) utility. To output logs in the console just simply set the `DEBUG` environment variable
```bash
DEBUG=jsreport node app.js
```

on windows do
```bash
set DEBUG=jsreport & node app.js
```

jsreport exposes `logger` property which can be used to adapt the logging as you like. You can for example just add [winston](https://github.com/winstonjs/winston) console transport and filter in only important log messages into console.
```js
var winston = require('winston')
var jsreport = require('jsreport-core')()
jsreport.logger.add(winston.transports.Console, { level: 'info' })
```

## Listeners
jsreport extensions are mainly using the system of event listeners to adapt the rendering process. Extension can for example listen to event which is called before the rendering process starts and adapt the input values.

```js
//jsreport must be initialized at this time
jsreport.beforeRenderListeners.add('name-of-listener', function(req, res) {
	req.template.content = 'Changing the template in listener!'
})
```

To start listening you must first add the listener function to the right listener. In the example is used `beforeRenderListeners` which is called before the rendering starts. jsreport then in the right time sequentially fires all the listener functions and let them do the required work. If the function returns a promise, jsreport awaits until it is fulfilled.

Note this technique can be used in extensions, but also outside in nodejs application using jsreport.

jsreport currently support these main listeners

- `initializeListeners()`- called when all extensions are initialized<br/>
- `beforeRenderListeners(req, res)` - very first in the rendering pipeline, used to load templates and parse input data<br/>
- `validateRenderListeners(req, res)` - possible to reject rendering before it starts, jsut return failed promise or exception<br/>
- `afterTemplatingEnginesExecutedListeners(req, res)` - engine like handlebars or jsrender extracted the content, the `res.content` contains Buffer with extracted content<br/>
- `afterRenderListeners(req, res)` - recipes are executed, `res.content` contains final buffer which will be returned as a stream back, the last change to modify the output or send it elsewhere<br/>
- `renderErrorListeners(req, res, err)` - fired when there is error somewhere in the rendering pipeline


## Studio
jsreport includes also visual html studio and rest API. This is provided through [jsreport-express](https://github.com/jsreport/jsreport-express) extension. See its documentation for details.

## Template store
`jsreport-core` includes API for persisting and accessing report templates. This API is then used by extensions mainly in combination with jsreport [studio](#studio). `jsreport-core` implements just in-memory persistence, but you can add other persistence methods through extensions. See the [list](#store-providers).

The persistence API is almost compatible to mongodb API:
```js
jsreport.documentStore.collection('templates')
	.find({name: 'test'})
	.then(function(res) {})

jsreport.documentStore.collection('templates')
	.update({name: 'test'}, { $set: { attr: 'value' })
	.then(function(res) {})

jsreport.documentStore.collection('templates')
	.insert({name: 'test'})
	.then(function(res) {})

jsreport.documentStore.collection('templates')
	.remove({name: 'test'})
	.then(function(res) {})
```
## List of extensions

### Store providers
- [jsreport-fs-store](https://github.com/jsreport/jsreport-fs-store)
- [jsreport-mongodb-store](https://github.com/jsreport/jsreport-mongodb-store)
- [jsreport-embedded-store](https://github.com/jsreport/jsreport-embedded-store)
- [jsreport-mssql-store](https://github.com/jsreport/jsreport-mssql-store)
- [jsreport-postgres-store](https://github.com/jsreport/jsreport-postgres-store)

### Engines
- [jsreport-jsrender](https://github.com/jsreport/jsreport-jsrender)
- [jsreport-handlebars](https://github.com/jsreport/jsreport-handlebars)
- [jsreport-ejs](https://github.com/jsreport/jsreport-ejs)
- [jsreport-jade](https://github.com/bjrmatos/jsreport-jade)

### Recipes
- [jsreport-phantom-pdf](https://github.com/jsreport/jsreport-phantom-pdf)
- [jsreport-electron-pdf](https://github.com/bjrmatos/jsreport-electron-pdf)
- [jsreport-text](https://github.com/jsreport/jsreport-text)
- [jsreport-xlsx](https://github.com/jsreport/jsreport-xlsx)
- [jsreport-html-to-xlsx](https://github.com/jsreport/jsreport-html-to-xlsx)
- [jsreport-phantom-image](https://github.com/jsreport/jsreport-phantom-image)
- [jsreport-html-to-text](https://github.com/jsreport/jsreport-html-to-text)
- [jsreport-fop-pdf](https://github.com/jsreport/jsreport-fop-pdf)
- [jsreport-client-html](https://github.com/jsreport/jsreport-client-html)
- [jsreport-wrapped-html](https://github.com/jsreport/jsreport-embedding)
- [jsreport-wkhtmltopdf](https://github.com/jsreport/jsreport-wkhtmltopdf)

### Misc

- [jsreport-express (studio)](https://github.com/jsreport/jsreport-express)
- [jsreport-templates](https://github.com/jsreport/jsreport-templates)
- [jsreport-data](https://github.com/jsreport/jsreport-data)
- [jsreport-scripts](https://github.com/jsreport/jsreport-scripts)
- [jsreport-reports](https://github.com/jsreport/jsreport-reports)
- [jsreport-images](https://github.com/jsreport/jsreport-images)
- [jsreport-scheduling](https://github.com/jsreport/jsreport-scheduling)
- [jsreport-statistics](https://github.com/jsreport/jsreport-statistics)
- [jsreport-public-templates](https://github.com/jsreport/jsreport-public-templates)
- [jsreport-authorization](https://github.com/jsreport/jsreport-authorization)
- [jsreport-authentication](https://github.com/jsreport/jsreport-authentication)
- [jsreport-child-templates](https://github.com/jsreport/jsreport-child-templates)
- [jsreport-embedding](https://github.com/jsreport/jsreport-embedding)
- [jsreport-resources](https://github.com/jsreport/jsreport-resources)
- [jsreport-static-resources](https://github.com/jsreport/jsreport-static-resources)
- [jsreport-client-app](https://github.com/jsreport/jsreport-client-app)
- [jsreport-freeze](https://github.com/jsreport/jsreport-freeze)
- [jsreport-debug](https://github.com/jsreport/jsreport-debug)

### Blob storages
- [jsreport-azure-storage](https://github.com/jsreport/jsreport-azure-storage)

## License
LGPL
