*** Settings ***
Documentation       Démo scénarisée de rf-web-recorder, ENREGISTRÉE EN VIDÉO (Playwright
...                 recordVideo) pour la communication. Sous-titres incrustés dans la page
...                 pour que la vidéo se comprenne sans commentaire audio.
...
...                 Lancer :  robot --variable OUT:<dossier> demo/demo_video.robot
...                 Sortie :  <dossier>/rf-web-recorder-demo.webm  (convertir en .mp4
...                 pour LinkedIn : ffmpeg -i ...webm -c:v libx264 -crf 23 ...mp4)

Library             Browser
Library             OperatingSystem
Library             Collections

Suite Teardown      Close Browser


*** Variables ***
${FIXTURE}          ${CURDIR}${/}demo_page.html
${BUNDLE}           ${CURDIR}${/}..${/}dist${/}recorder_snippet.js
${OUT}              ${CURDIR}${/}..${/}dist${/}video
${BEAT}             1.8s


*** Test Cases ***
Record The Demo Video
    ${url}=    Evaluate    pathlib.Path(r"${FIXTURE}").resolve().as_uri()    pathlib
    ${src}=    Get File    ${BUNDLE}
    # Chemin en SLASHES : un chemin Windows à backslashes est mangé à
    # l'évaluation du dict (\Q, \d… lus comme des échappements).
    ${video_dir}=    Evaluate    pathlib.Path(r"${OUT}").resolve().as_posix()    pathlib
    Set Suite Variable    ${VIDEO_DIR}    ${video_dir}
    Create Directory    ${video_dir}
    New Browser    chromium    headless=${False}    slowMo=0:00:00.20
    New Context
    ...    viewport={'width': 1280, 'height': 720}
    ...    recordVideo={'dir': '${video_dir}', 'size': {'width': 1280, 'height': 720}}
    ...    acceptDownloads=${True}
    New Page    ${url}
    Wait For Function    () => window.__demoReady === true    timeout=20s
    Install Caption Bar

    Caption    rf-web-recorder    Enregistreur universel de tests web → Robot Framework
    Sleep    2.5s

    Caption    1. Injection    Extension ou snippet console — le panneau apparaît
    # interception des Blobs : la vidéo pourra afficher la suite exportée
    Evaluate JavaScript    ${None}
    ...    () => { window.__blobs = []; const o = URL.createObjectURL.bind(URL); URL.createObjectURL = (b) => { window.__blobs.push(b); return o(b); }; }
    Evaluate JavaScript    ${None}    (s) => { (0,eval)(s); }    arg=${src}
    Wait For Function    () => !!window.__RFREC    timeout=10s
    Sleep    2.5s

    Caption    2. Mode enregistrement    Un clic sur « rec », puis on utilise l'application
    Click    css=#__rfrecPanel >> text="rec"
    Sleep    ${BEAT}

    Caption    3. Parcours utilisateur    Chaque action devient un step lisible
    Click    [data-testid="save-btn"]
    Sleep    ${BEAT}
    Click    [id="cust"]
    Type Text    [id="cust"]    Jean Dupont    delay=0:00:00.07
    Keyboard Key    press    Tab
    Sleep    ${BEAT}
    Select Options By    [id="country"]    label    Germany
    Sleep    ${BEAT}
    Check Checkbox    [id="gift"]
    Sleep    2s

    Caption    4. Localisateurs stables    role + nom accessible, data-testid — jamais un id généré
    Sleep    2.5s

    Caption    5. Assertions    Clic droit sur un élément pendant l'enregistrement
    Click    [id="saves"]    button=right
    Sleep    ${BEAT}
    Click    .__rfrecMenu >> text=Assert text
    Sleep    2.5s

    Caption    6. Remise à zéro    Le formulaire est vidé — le déroulé, lui, est conservé
    Evaluate JavaScript    ${None}
    ...    () => { document.getElementById('saves').textContent = '0'; document.getElementById('cust').value = ''; document.getElementById('gift').checked = false; document.getElementById('country').selectedIndex = 0; }
    Sleep    2.5s

    Caption    7. Replay dans la page    « play » rejoue le déroulé, step par step
    Click    css=#__rfrecPanel >> text="play"
    Wait For Function    () => window.__RFREC.isReplaying() === false    timeout=60s
    Sleep    2s
    ${saves}=    Get Text    [id="saves"]
    Should Be Equal    ${saves}    1
    Caption    7. Replay réussi    L'application a réellement réagi — validation avant export
    Sleep    2.5s

    Caption    8. Export    Suite .robot, paire resource-first, ou SeleniumLibrary
    Click    css=#__rfrecPanel >> text="export"
    Sleep    2.5s
    Click    .__rfrecMenu >> text=.robot suite (Browser)
    Sleep    1s
    Park Mouse
    Show Exported Suite

    Caption    Robot Framework, prêt à l'emploi    React · Angular · Vue · Web Components · vanilla
    Sleep    4s

    # la vidéo n'est écrite qu'à la FERMETURE du contexte
    Close Context
    Rename Video To    rf-web-recorder-demo.webm


*** Keywords ***
Install Caption Bar
    [Documentation]    Bandeau de sous-titres incrusté (haut de page) + habillage,
    ...                pour que la vidéo soit compréhensible sans audio.
    Evaluate JavaScript    ${None}
    ...    () => { const b = document.createElement('div'); b.id = '__demoCaption'; b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483000;background:linear-gradient(90deg,#12263f,#1d3f66);color:#fff;padding:14px 22px;font:600 20px/1.3 -apple-system,Segoe UI,sans-serif;box-shadow:0 2px 12px rgba(0,0,0,.3);'; const t = document.createElement('div'); t.id = '__demoTitle'; const s = document.createElement('div'); s.id = '__demoSub'; s.style.cssText = 'font:400 14px/1.4 -apple-system,Segoe UI,sans-serif;opacity:.85;margin-top:3px;'; b.appendChild(t); b.appendChild(s); document.body.appendChild(b); document.body.style.paddingTop = '86px'; window.__caption = (a, c) => { t.textContent = a; s.textContent = c || ''; }; }

Caption
    [Arguments]    ${title}    ${subtitle}=${EMPTY}
    # Les textes passent en ARGUMENT (jamais interpolés dans une chaîne JS) :
    # une apostrophe française (« l'application ») casserait le littéral.
    Evaluate JavaScript    ${None}
    ...    (s) => { const i = s.indexOf('||'); window.__caption(s.slice(0, i), s.slice(i + 2)); }    arg=${title}||${subtitle}
    Log To Console    \n>>> ${title} — ${subtitle}

Park Mouse
    [Documentation]    Gare le curseur SUR le panneau : le survol y est ignoré
    ...                (inOurUI), donc plus aucune pastille de surbrillance ne
    ...                traîne à l'écran sur les plans de fin.
    Hover    css=#__rfrecPanel >> text="Test:"
    Sleep    0.4s

Show Exported Suite
    [Documentation]    Affiche la suite exportée en surimpression : la vidéo montre le
    ...                LIVRABLE, pas seulement le geste.
    ${robot}=    Evaluate JavaScript    ${None}    () => window.__blobs && window.__blobs.length ? window.__blobs[0].text() : ''
    Log To Console    \n----- SUITE EXPORTÉE -----\n${robot}
    Evaluate JavaScript    ${None}
    ...    (t) => { const p = document.createElement('pre'); p.style.cssText = 'position:fixed;left:40px;top:110px;z-index:2147482000;background:#0d1117;color:#c9d1d9;padding:18px 22px;border-radius:8px;font:13px/1.5 Consolas,monospace;box-shadow:0 8px 30px rgba(0,0,0,.45);max-width:62%;white-space:pre-wrap;'; p.textContent = t; document.body.appendChild(p); }    arg=${robot}
    Sleep    5s

Rename Video To
    [Arguments]    ${name}
    Sleep    2s                      # Playwright finit d'écrire le .webm après Close Context
    Wait Until Keyword Succeeds    10x    1s    Video File Exists
    ${files}=    List Files In Directory    ${VIDEO_DIR}    *.webm
    ${first}=    Get From List    ${files}    0
    ${target}=    Normalize Path    ${VIDEO_DIR}/${name}
    Remove File    ${target}
    Move File    ${VIDEO_DIR}/${first}    ${target}
    ${size}=    Get File Size    ${target}
    Log To Console    \n>>> Vidéo : ${target} (${size} octets)

Video File Exists
    ${files}=    List Files In Directory    ${VIDEO_DIR}    *.webm
    Should Not Be Empty    ${files}    aucun .webm produit par Playwright
