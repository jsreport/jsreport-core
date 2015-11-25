# jsreport-core
[![NPM Version](http://img.shields.io/npm/v/jsreport-core.svg?style=flat-square)](https://npmjs.com/package/jsreport-core)
[![Build Status](https://travis-ci.org/jsreport/jsreport-core.png?branch=master)](https://travis-ci.org/jsreport/jsreport-core)

**The minimalist [jsreport](http://jsreport.net) rendering core.**

You can use only specific parts of [jsreport](http://jsreport.net) you really need. This package contains the jsreport rendering core which is useless alone. However you can quickly install additional recipes or engines you like and start rendering.

##Simple usage

>npm install jsreport-core
>npm install jsreport-jsrender
>npm install jsreport-phantom-pdf

```js
var Reporter = require('jsreport-core').Reporter
var reporter = new Reporter()

reporter.init().then(function () {     
   reporter.render({ 
	   template: { 
		   content: '<h1>Hello {{:a}}</h1>', 
		   engine: 'jsrender', 
		   recipe: 'phantom-pdf'
		}, 
		data: { 
			a: "world"
		}
	}).then(function(resp) {
	 //prints pdf with headline Hello world
     console.log(resp.content.toString());
   });
}); 
```

##Reporter
TODO

##Custom extensions, recipes, engines

[Implementing custom jsreport extension](http://jsreport.net/learn/custom-extension)
[Implementing custom jsreport recipe](http://jsreport.net/learn/custom-recipe)
[Implementing custom jsreport engine](http://jsreport.net/learn/custom-engine)


##List of extensions

###Store providers
- [jsreport-fs-store](https://github.com/jsreport/jsreport-fs-store)
- [jsreport-mongodb-store](https://github.com/jsreport/jsreport-mongodb-store)
- [jsreport-embedded-store](https://github.com/jsreport/jsreport-embedded-store)

###Engines
- [jsreport-jsrender](https://github.com/jsreport/jsreport-jsrender)
- [jsreport-handlebars](https://github.com/jsreport/jsreport-handlebars)
- [jsreport-ejs](https://github.com/jsreport/jsreport-ejs)
- [jsreport-jade](https://github.com/bjrmatos/jsreport-jade)

###Recipes
- [jsreport-phantom-pdf](https://github.com/jsreport/jsreport-phantom-pdf)
- [jsreport-text](https://github.com/jsreport/jsreport-text)
- [jsreport-xlsx](https://github.com/jsreport/jsreport-xlsx)
- [jsreport-html-to-xlsx](https://github.com/jsreport/jsreport-html-to-xlsx)
- [jsreport-html-to-text](https://github.com/jsreport/jsreport-html-to-text)
- [jsreport-fop-pdf](https://github.com/jsreport/jsreport-fop-pdf)
- [jsreport-client-html](https://github.com/jsreport/jsreport-client-html)
- [jsreport-wrapped-html](https://github.com/jsreport/jsreport-embedding)
- [jsreport-wkhtmltopdf](https://github.com/jsreport/jsreport-wkhtmltopdf)

###Misc

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

##License
LGPL

