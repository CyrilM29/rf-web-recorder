*** Settings ***
Documentation       End-to-end test of the built bundle (dist/recorder_snippet.js) in a
...                 real Chromium page: sensitive-field masking (password / cc-number /
...                 cvv / one-time-code), recording, sessionStorage persistence + resume
...                 after a reload, in-page replay, and both export flavours.
...
...                 Prerequisites (the only part of this repo with dependencies):
...                 ${SPACE*4}pip install robotframework robotframework-browser
...                 ${SPACE*4}rfbrowser init
...                 ${SPACE*4}node build.mjs${SPACE*4}# the suite tests the BUILT bundle
...                 Run:
...                 ${SPACE*4}robot --outputdir dist/e2e test/e2e/recorder_live.robot
...
...                 The bundle is injected exactly like the console-snippet delivery mode
...                 (eval of the file content); URL.createObjectURL is intercepted so the
...                 exported suites can be asserted without touching the filesystem.
...                 auto_closing_level=SUITE keeps the page alive between the two tests:
...                 the second one continues the first one's tab on purpose (reload test).

Library             Browser    auto_closing_level=SUITE
Library             OperatingSystem

Suite Teardown      Close Browser


*** Variables ***
${FIXTURE}          ${CURDIR}${/}sensitive_page.html
${BUNDLE}           ${CURDIR}${/}..${/}..${/}dist${/}recorder_snippet.js


*** Test Cases ***
Recording Masks Sensitive Fields And Exports Clean Suites
    File Should Exist    ${BUNDLE}    Bundle not found: run `node build.mjs` first.
    ${url}=    Evaluate    pathlib.Path(r"${FIXTURE}").resolve().as_uri()    pathlib
    ${src}=    Get File    ${BUNDLE}
    New Browser    chromium    headless=${True}
    New Context    viewport={'width': 1280, 'height': 960}    acceptDownloads=${True}
    New Page    ${url}
    Wait For Function    () => window.__demoReady === true    timeout=20s
    # Blob interception: lets the test read the exported suites without disk I/O
    Evaluate JavaScript    ${None}
    ...    () => { window.__blobs = []; const o = URL.createObjectURL.bind(URL); URL.createObjectURL = (b) => { window.__blobs.push(b); return o(b); }; }
    Evaluate JavaScript    ${None}    (s) => { (0,eval)(s); }    arg=${src}
    Wait For Function    () => !!window.__RFREC    timeout=10s
    Evaluate JavaScript    ${None}    () => window.__RFREC.setRecording(true)

    # -- user journey: 2 plain fields, 4 sensitive fields, 1 button click
    Click    id=user
    Type Text    id=user    jean.dupont    delay=0:00:00.02
    Keyboard Key    press    Tab
    Click    id=pass
    Type Text    id=pass    SuperSecret42!    delay=0:00:00.02
    Keyboard Key    press    Tab
    Click    id=card
    Type Text    id=card    4111222233334444    delay=0:00:00.02
    Keyboard Key    press    Tab
    Click    id=cvv
    Type Text    id=cvv    9876    delay=0:00:00.02
    Keyboard Key    press    Tab
    Click    id=otp
    Type Text    id=otp    424242    delay=0:00:00.02
    Keyboard Key    press    Tab
    Click    id=promo
    Type Text    id=promo    SUMMER2026    delay=0:00:00.02
    Keyboard Key    press    Tab
    Click    [data-testid="checkout-btn"]

    # -- sessionStorage must hold NO secret in clear text
    ${steps}=    Evaluate JavaScript    ${None}    () => sessionStorage.getItem('__rfrecSteps')
    Log    ${steps}
    Should Contain        ${steps}    jean.dupont           msg=non-sensitive values must stay in clear text
    Should Contain        ${steps}    SUMMER2026            msg=a promo code is not a sensitive field
    Should Contain        ${steps}    <PASSWORD>            msg=password inputs must record <PASSWORD>
    Should Contain        ${steps}    <SECRET>              msg=payment/OTP fields must record <SECRET>
    Should Not Contain    ${steps}    SuperSecret42         msg=LEAK: password stored in clear text
    Should Not Contain    ${steps}    4111222233334444      msg=LEAK: card number in clear text (autocomplete=cc-number)
    Should Not Contain    ${steps}    9876                  msg=LEAK: CVC in clear text (name=cvv pattern)
    Should Not Contain    ${steps}    424242                msg=LEAK: OTP in clear text (autocomplete=one-time-code)

    # -- Browser-library export: the downloaded suite must be clean too
    Evaluate JavaScript    ${None}    () => window.__RFREC.exportAs('robot')
    Wait For Function    () => window.__blobs.length > 0    timeout=10s
    ${suite}=    Evaluate JavaScript    ${None}    () => window.__blobs[0].text()
    Log    ${suite}
    Should Contain        ${suite}    *** Test Cases ***
    Should Contain        ${suite}    Fill Text
    Should Contain        ${suite}    <PASSWORD>
    Should Contain        ${suite}    <SECRET>
    Should Not Contain    ${suite}    SuperSecret42
    Should Not Contain    ${suite}    4111222233334444
    Should Not Contain    ${suite}    9876
    Should Not Contain    ${suite}    424242

    # -- SeleniumLibrary export: exercises the shared emit helpers + translation
    Evaluate JavaScript    ${None}    () => window.__RFREC.exportAs('selenium-robot')
    Wait For Function    () => window.__blobs.length > 1    timeout=10s
    ${sel}=    Evaluate JavaScript    ${None}    () => window.__blobs[1].text()
    Should Contain        ${sel}    SeleniumLibrary
    Should Contain        ${sel}    Input Text
    Should Not Contain    ${sel}    SuperSecret42
    Should Not Contain    ${sel}    4111222233334444

Recording Survives A Reload Then Replays Against The Live Page
    ${src}=    Get File    ${BUNDLE}
    Reload
    # after a full-page load the recorder must be re-injected; state resumes by itself
    Evaluate JavaScript    ${None}    (s) => { (0,eval)(s); }    arg=${src}
    Wait For Function    () => !!window.__RFREC    timeout=10s
    ${rec}=    Evaluate JavaScript    ${None}    () => window.__RFREC.isRecording()
    Should Be True    ${rec}    msg=recording must auto-resume after reload + re-injection
    ${count}=    Evaluate JavaScript    ${None}    () => JSON.parse(sessionStorage.getItem('__rfrecSteps')).length
    Should Be True    ${count} > 10    msg=steps must survive the reload (found ${count})

    # -- in-page replay: the recorded steps must actually drive the fresh DOM
    Evaluate JavaScript    ${None}    () => window.__RFREC.setRecording(false)
    Evaluate JavaScript    ${None}    () => window.__RFREC.play()
    Wait For Function    () => window.__RFREC.isReplaying() === false    timeout=90s
    ${panel}=    Evaluate JavaScript    ${None}    () => document.getElementById('__rfrecPanel').textContent
    Should Contain    ${panel}    replay OK    msg=replay must finish without a failed step (panel: ${panel})
    ${saves}=    Get Text    id=saves
    Should Be Equal    ${saves}    1    msg=the recorded click must have really clicked the button
    # plain fields replay their real value, masked fields replay the placeholder
    ${promo}=    Get Property    id=promo    value
    Should Be Equal    ${promo}    SUMMER2026
    ${pass}=    Get Property    id=pass    value
    Should Be Equal    ${pass}    <PASSWORD>
    Take Screenshot    fullPage=${True}
