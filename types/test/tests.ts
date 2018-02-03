import * as JsReport from "jsreport-core";
import * as JsReportPhantomPdf from "jsreport-phantom-pdf";
import * as fs from 'fs'


const jsreport = JsReport({
  tasks: {
    strategy: JsReport.TasksStrategy.HttpServer
  }
});

jsreport.beforeRenderListeners.add('test', (req, res) => {
  console.log('input', req.template.content)
});

jsreport.use(JsReportPhantomPdf());


(async () => {
  await jsreport.init();
  await jsreport.documentStore.collection('settings').update({}, { $set: { foo: 1 } })
  const res = await jsreport.render({
    template: {
      content: "<h1>{{foo}}</h1>",
      engine: JsReport.Engine.None,
      recipe: JsReport.Recipe.PhantomPdf,
      phantom: {
        header: 'header',
        headerHeight: '5cm'
      }
    },
    data: { foo: "hello2" }
  });
  console.log(res.content.toString());
})();