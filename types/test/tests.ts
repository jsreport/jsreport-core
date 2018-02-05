import * as JsReport from "jsreport-core";
import * as JsReportPhantomPdf from "jsreport-phantom-pdf";
import * as JsRender from "jsreport-jsrender";
import * as fs from 'fs';

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
      content: "<h1>{{foo}}</h1>",
      engine: JsReport.EngineType.JsRender,
      recipe: JsReport.RecipeType.PhantomPdf,
      phantom: {
        header: 'header',
        headerHeight: '5cm'
      }
    },
    data: { foo: "hello2" }
  });
  fs.writeFileSync('./types/test/test.pdf', res.content);
  process.exit(0);
})();
