import { describe,expect,it } from "vitest";
import { mapClickupTask } from "../lib/migration";

const base={
  id:"cu-1",name:"Create an account",status:"تم التواصل",date_created:"1777798044795",date_closed:"1777886591187",
  list:{id:"901522764966",name:"طلبات انشاء ايميلات"},url:"https://app.clickup.com/t/cu-1",
  priority:{priority:"low"},
  custom_fields:[
    {name:"الاسم الكامل",type:"short_text",value:"Test User",type_config:{}},
    {name:"الايميل الشخصي",type:"email",value:"user@example.com",type_config:{}},
    {name:"القسم",type:"drop_down",value:4,type_config:{options:[{id:"dept",name:"تحول رقمي",orderindex:4}]}},
    {name:"الشركة / المؤسسة",type:"drop_down",value:0,type_config:{options:[{id:"company",name:"سنكري القابضة",orderindex:0}]}}
  ]
};

describe("ClickUp migration mapping",()=>{
  it("decodes dropdown fields and preserves traceability",()=>{
    const result=mapClickupTask(base);
    expect(result.valid).toBe(true);
    expect(result.target).toMatchObject({
      type:"email_account_request",requester_name:"Test User",requester_email:"user@example.com",
      department:"تحول رقمي",company:"سنكري القابضة",status:"whatsapp_sent",priority:"low",
      import_source:"clickup",import_id:"cu-1"
    });
  });
  it("flags incomplete rows instead of fabricating values",()=>{
    const result=mapClickupTask({...base,custom_fields:[]});
    expect(result.valid).toBe(false);
    expect(result.warnings.join(" ")).toContain("missing");
    expect(result.target?.requester_email).toBe("");
  });
  it("rejects an unknown source list",()=>{
    const result=mapClickupTask({...base,list:{id:"unknown",name:"Unknown"}});
    expect(result.valid).toBe(false);
    expect(result.target).toBeNull();
  });
});
