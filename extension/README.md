# Jobfinder Application Copilot

A local Chrome/Edge Manifest V3 extension for monitored form preparation. It never clicks submit, logs in, reads email, or sends your packet to a server. It requires only `activeTab` and `scripting`; there are no broad host permissions or persistent storage. Closing the popup discards the imported packet; previously filled page fields remain.

## Install and use

1. Download this repository and open `chrome://extensions` (Edge: `edge://extensions`). Enable Developer mode, choose **Load unpacked**, and select this `extension` folder.
2. Download a reviewed application packet from Jobfinder. Open the packet's exact application URL, then open this extension and import the JSON packet.
3. Choose **Scan questions**. Choose **Fill saved answers**, then inspect every filled value on the page.
4. **Download unanswered** exports discovered unanswered questions for import into Jobfinder. Answer and confirm reuse there; download a fresh packet and import it to continue.
5. Upload your formatted CV manually, complete unsupported controls and declarations, then submit manually on the employer site. The optional CV text download is only a reference, not a formatted CV.

Pages with changed URL paths, application identifiers, or hashes are rejected. If an employer redirects to a different application address, update the task's application URL in Jobfinder after verifying the correct role. Each step of a multi-page application requires the appropriate reviewed URL. Extra tracking query parameters are allowed; every parameter provided in the packet must still match.

## Packet contract

```json
{
  "version": 1,
  "taskId": "application-task-id",
  "expiresAt": "2099-01-01T00:00:00.000Z",
  "job": { "title": "Python Engineer", "company": "Example", "applyUrl": "https://example.com/jobs/123/apply" },
  "cvText": "Verified, reviewed CV text",
  "answers": [
    { "question": "First name", "answer": "Alex", "scope": "global", "reuse": true }
  ]
}
```

`scope` is `global`, `application` (specific to this packet), or the matching `taskId`. Other scopes and `reuse:false` answers are ignored. Labels match exactly after lowercasing, whitespace normalization and trailing question punctuation removal; there is no fuzzy inference. Contradictory reusable answers invalidate the packet. Application URLs must use HTTPS. If `expiresAt` is supplied, it must be a valid future date; expiry is checked at import and before every scan/fill. Jobfinder issues packets with a 24-hour expiry; the example date above only illustrates the format. Exported question files have `{version:1,taskId,questions:[{key,label,required,options,type,manual?}]}`. Sensitive non-secret questions and declarations export labels/options with `manual:true` for contextual review in Jobfinder; passwords, OTP, payment and identity-secret controls are never exported. No existing page answers are exported.

Supports labelled, visible native text/email/tel/url/number fields, textareas, single selects and radio groups with fieldset legends. Existing nonempty answers are preserved. Select/radio answers need exactly one matching option label. Unlabelled controls, files, checkboxes, passwords, OTP/CAPTCHA fields, signatures, sensitive declarations and consent controls are manual. These exclusions are conservative heuristics, not a guarantee that every website is understood. Inspect every result.

Embedded frames, shadow DOM, custom widgets, new dynamically appearing questions and blocked extension pages are unsupported; rescan or complete manually. This is a deterministic form adapter, not a general autonomous browser or background job runner. Web pages can observe entered form values, as with manual typing. Downloaded packets contain personal information: store and delete them accordingly.

Run contract and form-adapter tests with `node --test extension/*.test.mjs` from the repository root. Adapter tests use simulated native fields; a live authenticated browser flow still requires manual verification.
