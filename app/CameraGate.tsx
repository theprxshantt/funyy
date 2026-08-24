<h1 className="text-2xl font-semibold mb-3">
  Just a tiny surprise 🎀
</h1>

<p className="text-white/60 mb-6">
  Camera permission is needed to continue.
</p>

<div className="text-sm text-white/50 leading-6 mb-6">
  <p>Please allow camera access when your browser asks.</p>
  <p>If you already blocked it, allow Camera from the browser settings.</p>
  <p>Then reload this page.</p>
</div>

<button
  onClick={() => window.location.reload()}
  className="px-6 py-3 rounded-full bg-white text-black font-medium hover:bg-white/90 transition"
>
  Try Again
</button>
