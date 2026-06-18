const CRM_WEBHOOK_URL = "https://YOUR_DOMAIN/api/leads/intake/google-form";
const CRM_SECRET = "YOUR_LEAD_INTAKE_SECRET";

function installLeadTrigger() {
  ScriptApp.newTrigger("onLeadFormSubmit").forForm(FormApp.getActiveForm()).onFormSubmit().create();
}

function onLeadFormSubmit(event) {
  const form = FormApp.getActiveForm();
  const response = event.response;
  const answers = {};

  response.getItemResponses().forEach((itemResponse) => {
    answers[itemResponse.getItem().getTitle()] = itemResponse.getResponse();
  });

  const payload = {
    form_id: form.getId(),
    form_name: form.getTitle(),
    response_id: response.getId(),
    submitted_at: response.getTimestamp().toISOString(),
    answers
  };

  UrlFetchApp.fetch(CRM_WEBHOOK_URL, {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: `Bearer ${CRM_SECRET}`
    },
    muteHttpExceptions: true,
    payload: JSON.stringify(payload)
  });
}
