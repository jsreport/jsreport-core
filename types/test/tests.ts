import JsReport from "jsreport-core";
import JsReportPhantomPdf from "jsreport-phantom-pdf";
import JsRender from "jsreport-jsrender";
import fs from 'fs';

const jsreport = JsReport({
  tasks: {
    strategy: JsReport.TasksStrategy.HttpServer
  }
});

jsreport.beforeRenderListeners.add('test', (req, res) => {
  console.log('input', req.template.content)
});

jsreport.use(JsReportPhantomPdf());
jsreport.use(JsRender());

(async () => {
  await jsreport.init();
  await jsreport.documentStore.collection('settings').update({}, { $set: { foo: 1 } })
  const res = await jsreport.render({
    template: {
      content: "<h1>{{:foo}}</h1>",
      engine: JsReport.Engine.JsRender,
      recipe: JsReport.Recipe.PhantomPdf,
      phantom: {
        header: 'header',
        headerHeight: '5cm',
        orientation: 'landscape'
      }
    },
    data: { foo: "hello2" }
  });
  fs.writeFileSync('./types/test/test.pdf', res.content);
  process.exit(0);
})();
