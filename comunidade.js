/* ===== Comunidade da adega: entrada com Google, aprovação do dono, bate-papo, curtidas e comentários =====
   Banco: Firebase (projeto adega-dos-brutos, conta Google da adega).
   Quem entra: o cliente entra com a conta Google, manda nome e WhatsApp e espera o dono liberar.
   O dono é a conta Google da adega (DONO_EMAIL). Ele aprova no painel, aba "Clientes".
   As regras de segurança ficam em firestore.rules (copiadas no Firebase > Firestore > Regras). */
(function(){
  "use strict";
  var DONO_EMAIL = "adegasdosbrutos@gmail.com";
  var CFG = {
    apiKey: "AIzaSyBuSmeg-yPhaD1hdpdK977X0IZy9qpjv_Y",
    authDomain: "adega-dos-brutos.firebaseapp.com",
    projectId: "adega-dos-brutos",
    storageBucket: "adega-dos-brutos.firebasestorage.app",
    messagingSenderId: "268184596513",
    appId: "1:268184596513:web:e876ea87c09ff0c92df360"
  };
  var V = "10.12.2";
  var $ = function(id){ return document.getElementById(id); };

  // ---------- utilidades ----------
  function el(tag, cls, txt){ var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function so(v){ return String(v || "").replace(/\D/g, ""); }
  function zapLimpo(v){ var d = so(v); if (d.length > 11 && d.indexOf("55") === 0) d = d.slice(2); return d; }
  function zapFmt(d){ d = zapLimpo(d); if (d.length === 11) return "(" + d.slice(0,2) + ") " + d.slice(2,7) + "-" + d.slice(7); if (d.length === 10) return "(" + d.slice(0,2) + ") " + d.slice(2,6) + "-" + d.slice(6); return d; }
  function quando(ts){
    if (!ts) return "agora";
    var d = ts.toDate ? ts.toDate() : new Date(ts);
    var hoje = new Date(), h = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    if (d.toDateString() === hoje.toDateString()) return h;
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " " + h;
  }
  function nomeLoja(){ return (window.LOJA && window.LOJA.nome) || "Adega dos Brutos"; }
  function navInterno(){ return /Instagram|FBAN|FBAV|FB_IAB|TikTok|BytedanceWebview|musical_ly|Line\//i.test(navigator.userAgent) || /; wv\)/.test(navigator.userAgent); }
  function travar(sim){ document.documentElement.style.overflow = sim ? "hidden" : ""; }

  // ---------- Firebase (carrega só quando precisa) ----------
  var fbPromessa = null, auth = null, db = null, FV = null;
  function carregarScript(src){
    return new Promise(function(ok, erro){ var s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = function(){ erro(new Error("script")); }; document.head.appendChild(s); });
  }
  function fb(){
    if (fbPromessa) return fbPromessa;
    var base = "https://www.gstatic.com/firebasejs/" + V + "/";
    var pronto = window.firebase && window.firebase.__falso ? Promise.resolve() :
      carregarScript(base + "firebase-app-compat.js").then(function(){ return Promise.all([carregarScript(base + "firebase-auth-compat.js"), carregarScript(base + "firebase-firestore-compat.js")]); });
    fbPromessa = pronto.then(function(){
      var app = firebase.apps && firebase.apps.length ? firebase.app() : firebase.initializeApp(CFG);
      auth = app.auth(); db = app.firestore(); FV = firebase.firestore.FieldValue;
      try { auth.languageCode = "pt-BR"; } catch(e) {}
      ligarAuth();
      return { auth: auth, db: db };
    });
    fbPromessa.catch(function(){ fbPromessa = null; });
    return fbPromessa;
  }

  // ---------- quem está usando ----------
  // estado.fase: "carregando" | "fora" | "sem-pedido" | "pendente" | "aprovado" | "recusado" | "bloqueado" | "dono"
  var estado = { fase: "carregando", user: null, acesso: null };
  var ouvintes = [], pararMeuDoc = null, authPronto = null;
  function ehDono(u){ return !!(u && u.email && u.email.toLowerCase() === DONO_EMAIL && u.emailVerified !== false); }
  function avisar(){ ouvintes.slice().forEach(function(f){ try { f(estado); } catch(e) {} }); }
  function ligarAuth(){
    authPronto = new Promise(function(pronto){
      var primeira = true;
      auth.onAuthStateChanged(function(u){
        if (pararMeuDoc) { pararMeuDoc(); pararMeuDoc = null; }
        estado.user = u || null; estado.acesso = null;
        if (!u) { estado.fase = "fora"; avisar(); if (primeira) { primeira = false; pronto(); } return; }
        if (ehDono(u)) { estado.fase = "dono"; avisar(); if (primeira) { primeira = false; pronto(); } return; }
        estado.fase = "carregando"; avisar();
        pararMeuDoc = db.collection("acessos").doc(u.uid).onSnapshot(function(d){
          estado.acesso = d.exists ? d.data() : null;
          estado.fase = d.exists ? (d.data().status || "pendente") : "sem-pedido";
          avisar(); if (primeira) { primeira = false; pronto(); }
        }, function(){
          estado.fase = "sem-pedido"; avisar(); if (primeira) { primeira = false; pronto(); }
        });
      });
    });
    try { auth.getRedirectResult().catch(function(){}); } catch(e) {}
  }
  function liberado(){ return estado.fase === "aprovado" || estado.fase === "dono"; }
  function meuNome(){ return estado.fase === "dono" ? nomeLoja() : ((estado.acesso && estado.acesso.nome) || ""); }
  function entrarGoogle(){
    var p = new firebase.auth.GoogleAuthProvider();
    try { p.setCustomParameters({ prompt: "select_account" }); } catch(e) {}
    return auth.signInWithPopup(p).catch(function(e){
      var c = e && e.code || "";
      if (c === "auth/popup-blocked" || c === "auth/operation-not-supported-in-this-environment") return auth.signInWithRedirect(p);
      throw e;
    });
  }
  function sair(){ return auth ? auth.signOut() : Promise.resolve(); }

  // ---------- tela "Peça para entrar" ----------
  var porta = null, portaOk = null, portaNao = null, portaMotivo = "";
  var TITULOS = { videos: "Vídeos da adega", chat: "Bate-papo da adega" };
  function montarPorta(){
    if (porta) return;
    porta = el("div", "cm-porta"); porta.hidden = true;
    porta.setAttribute("role", "dialog"); porta.setAttribute("aria-modal", "true"); porta.setAttribute("aria-labelledby", "cmPortaTit");
    porta.innerHTML = '<div class="cm-cx"><button type="button" class="cm-x" id="cmPortaX" aria-label="Fechar">✕</button>' +
      '<h2 id="cmPortaTit">Área dos clientes</h2><div id="cmPortaCorpo"></div></div>';
    document.body.appendChild(porta);
    $("cmPortaX").addEventListener("click", function(){ fecharPorta(false); });
    porta.addEventListener("click", function(e){ if (e.target === porta) fecharPorta(false); });
    document.addEventListener("keydown", function(e){ if (e.key === "Escape" && porta && !porta.hidden) fecharPorta(false); });
    ouvintes.push(function(){ if (!porta.hidden) desenharPorta(); });
  }
  function fecharPorta(ok){
    if (!porta) return;
    porta.hidden = true; travar(false);
    var f = ok ? portaOk : portaNao; portaOk = portaNao = null;
    if (f) f();
  }
  function msgPorta(t, erro){ var m = $("cmPortaMsg"); if (m) { m.textContent = t || ""; m.classList.toggle("erro", !!erro); } }
  function desenharPorta(){
    var c = $("cmPortaCorpo"); if (!c) return;
    $("cmPortaTit").textContent = TITULOS[portaMotivo] || "Área dos clientes";
    var f = estado.fase, u = estado.user, h = "";
    if (liberado()) { fecharPorta(true); return; }
    if (f === "carregando") h = '<p class="cm-p">Carregando…</p>';
    else if (f === "fora") {
      h = '<p class="cm-p">Os vídeos e o bate-papo são só para clientes liberados pela adega.</p>' +
        '<ol class="cm-passos"><li>Entre com a sua conta Google.</li><li>Escreva seu nome e WhatsApp.</li><li>Espere a adega liberar.</li></ol>' +
        (navInterno() ? '<p class="cm-alerta">Você abriu o site dentro de um aplicativo (Instagram, Facebook ou outro). Lá o Google não deixa entrar. Toque nos <b>três pontinhos</b> lá em cima e escolha <b>Abrir no navegador</b> (Chrome ou Safari).<br><button type="button" class="cm-link" id="cmCopiar">Copiar o endereço do site</button></p>' : '') +
        '<button type="button" class="cm-google" id="cmEntrar"><span class="g" aria-hidden="true">G</span> Entrar com Google</button>' +
        '<p id="cmPortaMsg" class="cm-msg" role="status" aria-live="polite"></p>' +
        '<p class="cm-mini">Seus dados ficam guardados só para a adega liberar o seu acesso. Veja em "Venda responsável e privacidade", no fim do site.</p>';
    }
    else if (f === "sem-pedido") {
      var nm = (u && u.displayName) || "";
      h = '<p class="cm-p">Você entrou como <b></b>. Agora peça para entrar:</p>' +
        '<label class="cm-campo">Seu nome<input id="cmNome" maxlength="40" autocomplete="name"></label>' +
        '<label class="cm-campo">Seu WhatsApp (com DDD)<input id="cmZap" inputmode="tel" placeholder="(11) 99999-9999" autocomplete="tel"></label>' +
        '<label class="cm-ciente"><input type="checkbox" id="cmCiente"> Tenho 18 anos ou mais e concordo que a adega guarde meu nome, WhatsApp e e-mail para liberar o acesso. Meu nome aparece nas minhas mensagens e comentários.</label>' +
        '<button type="button" class="cm-ouro" id="cmPedir">Pedir para entrar</button>' +
        '<p id="cmPortaMsg" class="cm-msg" role="status" aria-live="polite"></p>' +
        '<button type="button" class="cm-link" id="cmSair">Usar outra conta</button>';
      c.innerHTML = h;
      c.querySelector(".cm-p b").textContent = (u && u.email) || "";
      $("cmNome").value = nm.slice(0, 40);
      $("cmPedir").addEventListener("click", pedirAcesso);
      $("cmSair").addEventListener("click", sair);
      return;
    }
    else if (f === "pendente") {
      h = '<div class="cm-espera" aria-hidden="true">⏳</div><p class="cm-p"><b>Seu pedido foi enviado.</b> Aguarde a adega liberar. Pode deixar esta tela aberta: quando liberar, abre sozinho.</p>' +
        '<p class="cm-mini">Pedido em nome de <b id="cmPNome"></b>, WhatsApp <b id="cmPZap"></b>.</p>' +
        '<button type="button" class="cm-link" id="cmCancelar">Cancelar o pedido e apagar meus dados</button> <button type="button" class="cm-link" id="cmSair">Sair da conta</button>' +
        '<p id="cmPortaMsg" class="cm-msg" role="status" aria-live="polite"></p>';
    }
    else if (f === "recusado") {
      h = '<p class="cm-p">A adega não liberou o seu acesso desta vez. Se acha que foi engano, fale com a adega pelo WhatsApp.</p>' +
        '<button type="button" class="cm-link" id="cmCancelar">Apagar meus dados e pedir de novo</button> <button type="button" class="cm-link" id="cmSair">Sair da conta</button>' +
        '<p id="cmPortaMsg" class="cm-msg" role="status" aria-live="polite"></p>';
    }
    else if (f === "bloqueado") {
      h = '<p class="cm-p">O seu acesso aos vídeos e ao bate-papo foi bloqueado pela adega. Para pedidos, use normalmente o carrinho e o WhatsApp.</p>' +
        '<button type="button" class="cm-link" id="cmSair">Sair da conta</button>';
    }
    c.innerHTML = h;
    if ($("cmPNome") && estado.acesso) { $("cmPNome").textContent = estado.acesso.nome || ""; $("cmPZap").textContent = zapFmt(estado.acesso.whatsapp); }
    if ($("cmEntrar")) $("cmEntrar").addEventListener("click", function(){
      var b = this; b.disabled = true; msgPorta("Abrindo o Google…");
      entrarGoogle().then(function(){ msgPorta(""); }, function(e){
        var cod = e && e.code || "";
        if (cod === "auth/popup-closed-by-user" || cod === "auth/cancelled-popup-request") msgPorta("");
        else if (cod === "auth/unauthorized-domain") msgPorta("Este endereço do site ainda não foi autorizado no Firebase.", true);
        else msgPorta("Não deu para entrar com o Google. Confira a internet e tente de novo.", true);
      }).then(function(){ b.disabled = false; });
    });
    if ($("cmCopiar")) $("cmCopiar").addEventListener("click", function(){
      var u2 = location.origin + location.pathname, b = this;
      (navigator.clipboard ? navigator.clipboard.writeText(u2) : Promise.reject()).then(function(){ b.textContent = "Copiado ✓ Cole no Chrome ou no Safari"; }, function(){ b.textContent = u2; });
    });
    if ($("cmSair")) $("cmSair").addEventListener("click", sair);
    if ($("cmCancelar")) $("cmCancelar").addEventListener("click", function(){
      var b = this;
      if (!b.dataset.ok) { b.dataset.ok = "1"; b.textContent = "Toque de novo para confirmar"; return; }
      b.disabled = true;
      apagarMeusDados().then(function(){ msgPorta(""); }, function(){ msgPorta("Não deu para apagar. Tente de novo.", true); b.disabled = false; });
    });
  }
  function pedirAcesso(){
    var u = estado.user; if (!u) return;
    var nome = $("cmNome").value.replace(/\s+/g, " ").trim(), zap = zapLimpo($("cmZap").value);
    if (nome.length < 2) { msgPorta("Escreva o seu nome.", true); return; }
    if (zap.length !== 10 && zap.length !== 11) { msgPorta("WhatsApp com DDD. Ex.: (11) 99999-9999.", true); return; }
    if (!$("cmCiente").checked) { msgPorta("Marque a caixinha para continuar.", true); return; }
    var b = $("cmPedir"); b.disabled = true; msgPorta("Enviando…");
    var doc = { nome: nome, whatsapp: zap, email: u.email || "", foto: (u.photoURL || "").slice(0, 500), status: "pendente", criadoEm: FV.serverTimestamp() };
    db.collection("acessos").doc(u.uid).set(doc).then(function(){ msgPorta(""); }, function(){ msgPorta("Não deu para enviar. Tente de novo.", true); b.disabled = false; });
  }
  function apagarMeusDados(){
    var u = estado.user; if (!u) return Promise.resolve();
    var antes = liberado() ? db.collection("chat").where("uid", "==", u.uid).get().then(function(s){ return Promise.all(s.docs.map(function(d){ return d.ref.delete(); })); }).catch(function(){}) : Promise.resolve();
    // curtidas e comentários de cada vídeo da lista
    var nosVideos = liberado() ? fetch("videos.json?t=" + Date.now(), { cache: "no-store" }).then(function(r){ return r.ok ? r.json() : []; }).catch(function(){ return []; }).then(function(l){
      return Promise.all((Array.isArray(l) ? l : []).map(function(v){
        var ref = db.collection("videos").doc(idVideo(v));
        return Promise.all([
          ref.collection("curtidas").doc(u.uid).delete().catch(function(){}),
          ref.collection("comentarios").where("uid", "==", u.uid).get().then(function(s){ return Promise.all(s.docs.map(function(d){ return d.ref.delete(); })); }).catch(function(){})
        ]);
      }));
    }) : Promise.resolve();
    return Promise.all([antes, nosVideos]).then(function(){ return db.collection("acessos").doc(u.uid).delete(); });
  }
  // abre a tela de entrada se precisar; resolve quando a pessoa estiver liberada
  function exigirAcesso(motivo){
    return fb().then(function(){ return authPronto; }).then(function(){
      if (liberado()) return;
      montarPorta(); portaMotivo = motivo || "";
      return new Promise(function(ok, nao){
        portaOk = ok; portaNao = function(){ nao(new Error("fechou")); };
        porta.hidden = false; travar(true); desenharPorta();
      });
    }, function(e){
      alert("Não deu para abrir agora. Confira a internet e tente de novo.");
      throw e;
    });
  }
  window.adegaExigirAcesso = exigirAcesso;
  window.adegaComunidade = { estado: function(){ return estado; }, sair: sair, apagarMeusDados: apagarMeusDados };

  // ---------- bate-papo (uma sala só, igual ao antigo) ----------
  var chatPag = null, pararChat = null, chatMsgs = [];
  function montarChat(){
    if (chatPag) return;
    chatPag = el("div", "cm-chat"); chatPag.hidden = true;
    chatPag.setAttribute("role", "dialog"); chatPag.setAttribute("aria-modal", "true"); chatPag.setAttribute("aria-label", "Bate-papo da adega");
    chatPag.innerHTML = '<div class="cm-chat-topo"><button type="button" id="cmChatFechar">← Voltar</button><strong>Bate-papo da adega</strong><button type="button" id="cmChatConta">Conta</button></div>' +
      '<div class="cm-chat-lista" id="cmChatLista" aria-live="polite"><p class="cm-vazio" id="cmChatVazio">Carregando…</p></div>' +
      '<p class="cm-chat-aviso" id="cmChatAviso" hidden></p>' +
      '<form class="cm-chat-form" id="cmChatForm"><label class="cm-foto-btn" title="Mandar foto"><input type="file" id="cmChatFoto" accept="image/*" hidden><span aria-hidden="true">📷</span><span class="sr">Mandar foto</span></label>' +
      '<textarea id="cmChatTxt" rows="1" maxlength="500" placeholder="Mensagem…" aria-label="Mensagem"></textarea>' +
      '<button type="submit" id="cmChatEnviar">Enviar</button></form>' +
      '<div class="cm-foto-pre" id="cmFotoPre" hidden><img alt="Foto escolhida"><button type="button" id="cmFotoTirar">Tirar foto</button></div>';
    document.body.appendChild(chatPag);
    $("cmChatFechar").addEventListener("click", fecharChat);
    $("cmChatConta").addEventListener("click", menuConta);
    $("cmChatForm").addEventListener("submit", function(e){ e.preventDefault(); enviarChat(); });
    $("cmChatTxt").addEventListener("keydown", function(e){ if (e.key === "Enter" && !e.shiftKey && !/Android|iPhone|iPad/i.test(navigator.userAgent)) { e.preventDefault(); enviarChat(); } });
    $("cmChatTxt").addEventListener("input", function(){ this.style.height = "auto"; this.style.height = Math.min(this.scrollHeight, 120) + "px"; });
    $("cmChatFoto").addEventListener("change", escolherFoto);
    $("cmFotoTirar").addEventListener("click", function(){ fotoPronta = null; $("cmFotoPre").hidden = true; $("cmChatFoto").value = ""; });
    document.addEventListener("keydown", function(e){ if (e.key === "Escape" && chatPag && !chatPag.hidden && (!porta || porta.hidden)) fecharChat(); });
    ouvintes.push(function(){ if (chatPag && !chatPag.hidden && !liberado()) fecharChat(); });
  }
  function avisoChat(t){ var a = $("cmChatAviso"); a.textContent = t || ""; a.hidden = !t; }
  function abrirChat(){
    exigirAcesso("chat").then(function(){
      montarChat(); chatPag.hidden = false; travar(true); avisoChat("");
      if (pararChat) pararChat();
      pararChat = db.collection("chat").orderBy("criadoEm", "desc").limit(150).onSnapshot(function(s){
        chatMsgs = s.docs.map(function(d){ var o = d.data({ serverTimestamps: "estimate" }); o.id = d.id; return o; }).reverse();
        desenharChat();
      }, function(){ $("cmChatVazio").textContent = "Não foi possível carregar o bate-papo."; });
      setTimeout(function(){ try { $("cmChatTxt").focus(); } catch(e) {} }, 50);
      if (location.hash !== "#batepapo") history.replaceState(null, "", location.pathname + location.search + "#batepapo");
    }, function(){});
  }
  function fecharChat(){
    if (!chatPag) return;
    chatPag.hidden = true; travar(false);
    if (pararChat) { pararChat(); pararChat = null; }
    if (location.hash === "#batepapo") history.replaceState(null, "", location.pathname + location.search);
  }
  function podeApagar(m){ return estado.fase === "dono" || (estado.user && m.uid === estado.user.uid); }
  function desenharChat(){
    var lista = $("cmChatLista"), embaixo = lista.scrollHeight - lista.scrollTop - lista.clientHeight < 80;
    lista.textContent = "";
    if (!chatMsgs.length) { var v = el("p", "cm-vazio", "Ainda não tem mensagens. Puxa assunto!"); v.id = "cmChatVazio"; lista.appendChild(v); return; }
    var eu = estado.user && estado.user.uid;
    chatMsgs.forEach(function(m){
      var b = el("div", "cm-msg-b" + (m.uid === eu ? " minha" : "") + (m.dono ? " da-adega" : ""));
      var cab = el("div", "cm-msg-cab");
      cab.appendChild(el("b", null, m.dono ? nomeLoja() : (m.nome || "Cliente")));
      if (m.dono) cab.appendChild(el("span", "cm-selo", "adega"));
      cab.appendChild(el("time", null, quando(m.criadoEm)));
      b.appendChild(cab);
      if (m.foto) { var im = el("img", "cm-msg-foto"); im.src = m.foto; im.alt = "Foto enviada por " + (m.nome || "cliente"); im.loading = "lazy"; im.addEventListener("click", function(){ verFoto(m.foto); }); b.appendChild(im); }
      if (m.texto) b.appendChild(el("p", null, m.texto));
      if (podeApagar(m)) {
        var x = el("button", "cm-apagar", "Apagar"); x.type = "button";
        x.addEventListener("click", function(){
          if (!x.dataset.ok) { x.dataset.ok = "1"; x.textContent = "Apagar mesmo?"; return; }
          x.disabled = true; db.collection("chat").doc(m.id).delete().catch(function(){ x.disabled = false; avisoChat("Não deu para apagar."); });
        });
        b.appendChild(x);
      }
      lista.appendChild(b);
    });
    if (embaixo || !lista.dataset.rolou) { lista.scrollTop = lista.scrollHeight; lista.dataset.rolou = "1"; }
  }
  var fotoPronta = null;
  function escolherFoto(){
    var f = this.files && this.files[0]; if (!f) return;
    if (!/^image\//.test(f.type)) { avisoChat("Escolha uma foto."); return; }
    avisoChat("Preparando a foto…");
    reduzirFoto(f).then(function(url){
      fotoPronta = url; avisoChat("");
      $("cmFotoPre").querySelector("img").src = url; $("cmFotoPre").hidden = false;
    }, function(){ avisoChat("Não deu para usar essa foto. Tente outra."); });
  }
  function reduzirFoto(f){
    return new Promise(function(ok, erro){
      var r = new FileReader();
      r.onerror = erro;
      r.onload = function(){
        var im = new Image();
        im.onerror = erro;
        im.onload = function(){
          var max = 1000, w = im.naturalWidth, h = im.naturalHeight, k = Math.min(1, max / Math.max(w, h));
          var cv = document.createElement("canvas"); cv.width = Math.round(w * k); cv.height = Math.round(h * k);
          cv.getContext("2d").drawImage(im, 0, 0, cv.width, cv.height);
          var q = 0.75, url = cv.toDataURL("image/jpeg", q);
          while (url.length > 300000 && q > 0.35) { q -= 0.1; url = cv.toDataURL("image/jpeg", q); }
          if (url.length > 300000) { cv.width = Math.round(cv.width * 0.7); cv.height = Math.round(cv.height * 0.7); cv.getContext("2d").drawImage(im, 0, 0, cv.width, cv.height); url = cv.toDataURL("image/jpeg", 0.6); }
          url.length > 380000 ? erro(new Error("grande")) : ok(url);
        };
        im.src = r.result;
      };
      r.readAsDataURL(f);
    });
  }
  function enviarChat(){
    var t = $("cmChatTxt").value.trim();
    if (!t && !fotoPronta) return;
    if (!liberado()) return;
    var b = $("cmChatEnviar"); b.disabled = true;
    var m = { texto: t.slice(0, 500), uid: estado.user.uid, nome: meuNome(), dono: estado.fase === "dono", criadoEm: FV.serverTimestamp() };
    if (fotoPronta) m.foto = fotoPronta;
    db.collection("chat").add(m).then(function(){
      $("cmChatTxt").value = ""; $("cmChatTxt").style.height = "auto"; fotoPronta = null; $("cmFotoPre").hidden = true; $("cmChatFoto").value = ""; avisoChat("");
      var l = $("cmChatLista"); l.scrollTop = l.scrollHeight;
    }, function(){ avisoChat("Não deu para enviar. Tente de novo."); }).then(function(){ b.disabled = false; });
  }
  function verFoto(src){
    var v = el("div", "cm-ver-foto"); var im = el("img"); im.src = src; im.alt = "Foto";
    v.appendChild(im); v.addEventListener("click", function(){ v.remove(); }); document.body.appendChild(v);
  }
  function menuConta(){
    var u = estado.user, a = $("cmChatAviso");
    a.hidden = false; a.textContent = "";
    a.appendChild(document.createTextNode("Você está como " + (meuNome() || "") + (u && u.email ? " (" + u.email + "). " : ". ")));
    var s = el("button", "cm-link", "Sair da conta"); s.type = "button"; s.addEventListener("click", function(){ sair().then(fecharChat); });
    a.appendChild(s);
    if (estado.fase !== "dono") {
      a.appendChild(document.createTextNode(" "));
      var d = el("button", "cm-link", "Apagar meus dados"); d.type = "button";
      d.addEventListener("click", function(){
        if (!d.dataset.ok) { d.dataset.ok = "1"; d.textContent = "Toque de novo: apaga seu cadastro e suas mensagens"; return; }
        d.disabled = true; apagarMeusDados().then(function(){ return sair(); }).then(fecharChat, function(){ avisoChat("Não deu para apagar. Tente de novo."); });
      });
      a.appendChild(d);
    }
  }
  window.adegaAbrirChat = abrirChat;

  // ---------- curtidas e comentários nos vídeos ----------
  var pararVideos = [];
  function idVideo(v){ return String(v.id || v.arquivo || "").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 60) || "video"; }
  // chamado pela tela de vídeos para cada vídeo montado
  window.adegaSocialVideo = function(info, v){
    if (!db || !liberado()) return;
    var vid = idVideo(v), ref = db.collection("videos").doc(vid);
    var cur = el("button", "cm-cur", "❤ 0"); cur.type = "button"; cur.setAttribute("aria-label", "Curtir");
    var com = el("button", "cm-com", "💬 0"); com.type = "button"; com.setAttribute("aria-label", "Comentários");
    var eu = estado.user.uid, curti = false;
    pararVideos.push(ref.collection("curtidas").onSnapshot(function(s){
      curti = s.docs.some(function(d){ return d.id === eu; });
      cur.textContent = (curti ? "❤️ " : "🤍 ") + s.size; cur.setAttribute("aria-pressed", String(curti));
    }, function(){}));
    pararVideos.push(ref.collection("comentarios").onSnapshot(function(s){ com.textContent = "💬 " + s.size; }, function(){}));
    cur.addEventListener("click", function(ev){
      ev.stopPropagation(); cur.disabled = true;
      var d = ref.collection("curtidas").doc(eu);
      (curti ? d.delete() : d.set({ criadoEm: FV.serverTimestamp() })).catch(function(){}).then(function(){ cur.disabled = false; });
    });
    com.addEventListener("click", function(ev){ ev.stopPropagation(); abrirComentarios(ref, v); });
    var bt = info.querySelector("button");
    info.insertBefore(cur, bt); info.insertBefore(com, bt);
  };
  window.adegaSocialParar = function(){ pararVideos.forEach(function(f){ try { f(); } catch(e) {} }); pararVideos = []; fecharComentarios(); };
  var coms = null, pararComs = null;
  function abrirComentarios(ref, v){
    if (!coms) {
      coms = el("div", "cm-coms"); coms.setAttribute("role", "dialog"); coms.setAttribute("aria-label", "Comentários");
      coms.innerHTML = '<div class="cm-coms-cx"><div class="cm-coms-topo"><strong>Comentários</strong><button type="button" id="cmComsX">Fechar</button></div>' +
        '<div class="cm-coms-lista" id="cmComsLista"></div>' +
        '<form class="cm-chat-form" id="cmComsForm"><textarea id="cmComsTxt" rows="1" maxlength="300" placeholder="Comentário…" aria-label="Comentário"></textarea><button type="submit">Enviar</button></form></div>';
      document.body.appendChild(coms);
      $("cmComsX").addEventListener("click", fecharComentarios);
      coms.addEventListener("click", function(e){ if (e.target === coms) fecharComentarios(); });
    }
    coms.hidden = false;
    var lista = $("cmComsLista"); lista.innerHTML = '<p class="cm-vazio">Carregando…</p>';
    if (pararComs) pararComs();
    pararComs = ref.collection("comentarios").orderBy("criadoEm", "asc").limit(200).onSnapshot(function(s){
      lista.textContent = "";
      if (!s.size) { lista.appendChild(el("p", "cm-vazio", "Ninguém comentou ainda. Seja o primeiro!")); return; }
      s.docs.forEach(function(d){
        var m = d.data({ serverTimestamps: "estimate" });
        var b = el("div", "cm-com-item" + (m.dono ? " da-adega" : ""));
        var cab = el("div", "cm-msg-cab"); cab.appendChild(el("b", null, m.dono ? nomeLoja() : (m.nome || "Cliente"))); if (m.dono) cab.appendChild(el("span", "cm-selo", "adega")); cab.appendChild(el("time", null, quando(m.criadoEm)));
        b.appendChild(cab); b.appendChild(el("p", null, m.texto || ""));
        if (podeApagar(m)) { var x = el("button", "cm-apagar", "Apagar"); x.type = "button"; x.addEventListener("click", function(){ if (!x.dataset.ok) { x.dataset.ok = "1"; x.textContent = "Apagar mesmo?"; return; } d.ref.delete(); }); b.appendChild(x); }
        lista.appendChild(b);
      });
      lista.scrollTop = lista.scrollHeight;
    }, function(){ lista.innerHTML = '<p class="cm-vazio">Não foi possível carregar.</p>'; });
    var f = $("cmComsForm");
    f.onsubmit = function(e){
      e.preventDefault();
      var t = $("cmComsTxt").value.trim(); if (!t || !liberado()) return;
      var bt = f.querySelector("button"); bt.disabled = true;
      ref.collection("comentarios").add({ texto: t.slice(0, 300), uid: estado.user.uid, nome: meuNome(), dono: estado.fase === "dono", criadoEm: FV.serverTimestamp() })
        .then(function(){ $("cmComsTxt").value = ""; }, function(){ alert("Não deu para comentar. Tente de novo."); }).then(function(){ bt.disabled = false; });
    };
  }
  function fecharComentarios(){ if (coms) coms.hidden = true; if (pararComs) { pararComs(); pararComs = null; } }

  // ---------- cartões no site (vídeos, bate-papo e grupo) ----------
  function ligarCartoes(){
    var cb = $("chatAbrir"); if (cb) cb.addEventListener("click", abrirChat);
    if (location.hash === "#batepapo") abrirChat();
  }

  // ---------- painel do dono: aba Clientes ----------
  var pararClientes = null, clientes = [];
  window.adegaPainelClientes = function(){
    var c = $("pdCliCorpo"); if (!c) return;
    c.innerHTML = '<p class="pd-msg">Carregando…</p>';
    fb().then(function(){ return authPronto; }).then(function(){
      desenharPainelClientes();
      if (!ouvintes.__painel) { ouvintes.__painel = 1; ouvintes.push(function(){ if ($("pdCliCorpo") && !$("pdCliCorpo").closest(".pd-sec").hidden) desenharPainelClientes(); }); }
    }, function(){ c.innerHTML = '<p class="pd-msg erro">Não consegui ligar no Firebase. Confira a internet.</p>'; });
  };
  function desenharPainelClientes(){
    var c = $("pdCliCorpo"); if (!c) return;
    var u = estado.user;
    if (estado.fase !== "dono") {
      if (pararClientes) { pararClientes(); pararClientes = null; }
      c.innerHTML = '<div class="pd-caixa" style="display:grid;gap:12px;max-width:640px"><h3>Entrar com o Google da adega</h3>' +
        '<p class="exp">Para aprovar clientes, entre com a conta Google da adega: <b>' + DONO_EMAIL + '</b>. Só essa conta pode aprovar, recusar e bloquear.</p>' +
        (u ? '<p class="exp" id="pdCliOutra"></p>' : '') +
        '<div class="pd-linha-botoes"><button id="pdCliEntrar" class="pd-btn ouro" type="button">' + (u ? "Trocar de conta" : "Entrar com Google") + '</button></div><p id="pdCliMsg" class="pd-msg" role="status" aria-live="polite"></p></div>';
      if ($("pdCliOutra")) $("pdCliOutra").textContent = "Agora está aberta a conta " + (u.email || "") + ", que não é a da adega.";
      $("pdCliEntrar").addEventListener("click", function(){
        var b = this; b.disabled = true;
        (u ? sair() : Promise.resolve()).then(entrarGoogle).catch(function(e){ var cod = e && e.code || ""; if (cod !== "auth/popup-closed-by-user" && cod !== "auth/cancelled-popup-request") $("pdCliMsg").textContent = "Não deu para entrar. Tente de novo."; }).then(function(){ if ($("pdCliEntrar")) $("pdCliEntrar").disabled = false; });
      });
      marcarPendentes(0);
      return;
    }
    if (!$("pdCliListas")) {
      c.innerHTML = '<p class="exp">Conta da adega aberta ✓ <button type="button" class="pd-btn fantasma" id="pdCliSair" style="padding:6px 10px;margin-left:8px">Sair</button></p>' +
        '<div id="pdCliListas" style="display:grid;gap:16px"></div>' +
        '<div class="pd-caixa"><h3>Mensagens e comentários</h3><p class="exp">Para apagar uma mensagem ou um comentário feio, abra o bate-papo ou os vídeos no site com esta mesma conta. Aparece "Apagar" em todas as mensagens. As mensagens da adega saem com o selo dourado.</p>' +
        '<div class="pd-linha-botoes"><button type="button" class="pd-btn" id="pdCliChat">Abrir o bate-papo</button></div></div>';
      $("pdCliSair").addEventListener("click", function(){ sair(); });
      $("pdCliChat").addEventListener("click", function(){ abrirChat(); });
    }
    if (!pararClientes) {
      pararClientes = db.collection("acessos").orderBy("criadoEm", "desc").onSnapshot(function(s){
        clientes = s.docs.map(function(d){ var o = d.data({ serverTimestamps: "estimate" }); o.uid = d.id; return o; });
        listasClientes();
      }, function(){ var l = $("pdCliListas"); if (l) l.innerHTML = '<p class="pd-msg erro">Não consegui ler os pedidos. As regras do Firebase estão certas?</p>'; });
    } else listasClientes();
  }
  function marcarPendentes(n){
    document.querySelectorAll('.pd-aba[data-aba="clientes"]').forEach(function(b){ b.textContent = "👥 Clientes" + (n ? " (" + n + ")" : ""); });
  }
  function listasClientes(){
    var l = $("pdCliListas"); if (!l) return;
    var grupos = [
      { t: "Pedidos esperando", f: function(x){ return x.status === "pendente"; }, vazio: "Nenhum pedido novo.", b: [["Aprovar", "aprovado", "ouro"], ["Recusar", "recusado", "fantasma"]] },
      { t: "Clientes liberados", f: function(x){ return x.status === "aprovado"; }, vazio: "Ninguém liberado ainda.", b: [["Bloquear", "bloqueado", "perigo"]] },
      { t: "Recusados e bloqueados", f: function(x){ return x.status === "recusado" || x.status === "bloqueado"; }, vazio: "Nenhum.", b: [["Liberar", "aprovado", "fantasma"], ["Apagar dados", "apagar", "perigo"]] }
    ];
    marcarPendentes(clientes.filter(grupos[0].f).length);
    l.textContent = "";
    grupos.forEach(function(g){
      var cx = el("div", "pd-caixa"), lst = clientes.filter(g.f);
      cx.appendChild(el("h3", null, g.t + " (" + lst.length + ")"));
      if (!lst.length) cx.appendChild(el("p", "exp", g.vazio));
      lst.forEach(function(x){
        var r = el("div", "pd-cli");
        var im = el("img"); im.alt = ""; im.referrerPolicy = "no-referrer"; if (x.foto) im.src = x.foto; r.appendChild(im);
        var tx = el("div", "pd-cli-tx");
        tx.appendChild(el("b", null, x.nome || "(sem nome)"));
        var z = el("a", null, "WhatsApp " + zapFmt(x.whatsapp)); z.href = "https://wa.me/55" + zapLimpo(x.whatsapp); z.target = "_blank"; z.rel = "noopener"; tx.appendChild(z);
        tx.appendChild(el("small", null, (x.email || "") + " · pediu em " + quando(x.criadoEm) + (x.status === "bloqueado" ? " · BLOQUEADO" : x.status === "recusado" ? " · recusado" : "")));
        r.appendChild(tx);
        var bs = el("div", "pd-cli-bt");
        g.b.forEach(function(bb){
          var bt = el("button", "pd-btn " + bb[2], bb[0]); bt.type = "button";
          bt.addEventListener("click", function(){
            if (bb[1] === "apagar" || bb[1] === "bloqueado") { if (!bt.dataset.ok) { bt.dataset.ok = "1"; bt.textContent = "Confirmar?"; return; } }
            bt.disabled = true;
            var ref = db.collection("acessos").doc(x.uid);
            (bb[1] === "apagar" ? ref.delete() : ref.update({ status: bb[1], decididoEm: FV.serverTimestamp() })).catch(function(){ alert("Não deu. Tente de novo."); bt.disabled = false; });
          });
          bs.appendChild(bt);
        });
        r.appendChild(bs);
        cx.appendChild(r);
      });
      l.appendChild(cx);
    });
  }
  // o dono já abre o Firebase ao entrar no painel, para mostrar quantos pedidos esperam
  window.adegaClientesContar = function(){
    fb().then(function(){ return authPronto; }).then(function(){
      if (estado.fase !== "dono") return;
      db.collection("acessos").where("status", "==", "pendente").get().then(function(s){ marcarPendentes(s.size); }, function(){});
    }, function(){});
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ligarCartoes); else ligarCartoes();
})();
