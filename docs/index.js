(() => {
  const output = document.getElementById('output');
  const ansiUp = new AnsiUp();
  const sorbetWasm = fetch('sorbet-wasm.wasm')
    .then((response) => response.arrayBuffer())
    .then((bytes) => WebAssembly.compile(bytes));

  let runId = 0;
  let curId = 0;
  let stdout = [];
  const print = (line) => {
    if (runId != curId) {
      return;
    }
    stdout.push(line);
  };
  const flush = () => {
    gtag('event', 'typecheck', {
      event_category: 'error_lines',
      event_label: stdout.length,
    });
    const errorLines = stdout.join('\n').match(/^[^ ]/gm);
    gtag('event', 'typecheck', {
      event_category: 'errors',
      event_label: errorLines ? errorLines.length : 0,
    });
    output.innerHTML = ansiUp.ansi_to_html(stdout.join('\n'));
    stdout = [];
  };

  let sorbet = null;
  const compile = () => {
    if (sorbet) {
      // Already compiling or compiled
      return sorbet;
    }
    // For some unkonwn reason this varible has to be new everytime, and can't
    // be out of the closure
    const opts = {
      print,
      printErr: (line) => {
        line = line.replace(/.*\[error\] /, '');
        line = line.replace(/http:\/\/[^ ]*/, '');
        line = line.replace(
          'git.corp.stripe.com/stripe-internal',
          'github.com/stripe'
        );
        print(line);
      },
      onAbort: () => {
        // On abort, throw away our WebAssembly instance and create a
        // new one. This can happen due to out-of-memory, C++ exceptions,
        // or other reasons; Throwing away and restarting should get us to a healthy state.
        sorbet = null;
        flush();
      },
      instantiateWasm: (info, realRecieveInstanceCallBack) => {
        sorbetWasm
          .then((module) =>
            WebAssembly.instantiate(module, info)
              .then((instance) => realRecieveInstanceCallBack(instance, module))
              .catch((error) => console.log(error))
          )
          .catch((error) => {
            output.innerText =
              "Error loading sorbet.wasm. Maybe your adblock blocked it? Some of them are pretty aggressive on github.io domains. We promise we aren't mining crypto currencies on your computer.";
          });
        return {}; // indicates lazy initialization
      },
    };

    sorbet = Sorbet(opts);
    return sorbet;
  };

  let lastRuby = '';
  const runCpp = (Module) => {
    const ruby = editor.getValue();
    if (lastRuby == ruby) {
      return;
    }
    lastRuby = ruby;
    runId += 1;
    curId = runId;

    const t0 = performance.now();
    const f = Module.cwrap('typecheck', null, ['string']);
    f(ruby + '\n');
    const t1 = performance.now();

    gtag('event', 'timing_complete', {
      event_category: 'typecheck_time',
      event_label: t1 - t0,
      name: 'typecheck_time',
      value: t1 - t0,
    });

    flush();
  };

  const typecheck = () => {
    setTimeout(() => {
      compile().then(runCpp);
    }, 1);
  };

  const updateURL = () => {
    const ruby = editor.getValue();
    window.location.hash = '#' + encodeURIComponent(ruby);
  };
  window.addEventListener('hashchange', () => {
    // Remove leading '#'
    const hash = window.location.hash.substr(1);
    const ruby = decodeURIComponent(hash);
    if (editor.getValue() != ruby) {
      editor.setValue(ruby);
      editor.clearSelection();
    }
  });

  let showing = false;
  document.getElementById('menu').addEventListener('click', () => {
    const examples = document.getElementById('examples');
    if (showing) {
      examples.style.display = 'none';
    } else {
      examples.style.display = 'block';
    }
    showing = !showing;
  });

  typecheck();

  window.typecheck = typecheck;
  window.updateURL = updateURL;
})();
