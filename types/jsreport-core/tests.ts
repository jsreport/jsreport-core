import * as JsReport from "jsreport-core";

const jsreport = JsReport();

(async () => {
  await jsreport.init();
  await jsreport.documentStore.collection('settings').update({}, {$set: { foo: 1}})
  const res = await jsreport.render({
    template: {
      content: "<h1>{{foo}}</h1>",
      engine: JsReport.Engine.None,
      recipe: JsReport.Recipe.Html,           
    },
    data: { foo: "hello2" }
  }); 
  console.log(res.content.toString());
})();