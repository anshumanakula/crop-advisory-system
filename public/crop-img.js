(function () {
  var NAMES = {
    'rice':'rice','wheat':'wheat','maize':'maize','cotton':'cotton','sugarcane':'sugarcane',
    'chickpea':'chickpea','lentil':'lentil','groundnut':'groundnut','soybean':'soybean',
    'potato':'potato','tomato':'tomato','pearl millet':'pearl-millet'
  };
  var SKIP = /^(OPTION|SELECT|SCRIPT|STYLE|TEXTAREA|INPUT|TITLE|IMG|BUTTON)$/;
  function scan(root) {
    var els = root.querySelectorAll('*');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (SKIP.test(el.tagName) || el.children.length > 0 || el.dataset.cropImg) continue;
      var t = (el.textContent || '').trim().toLowerCase().replace(/^#?\d+[.)]?\s*/, '');
      var id = NAMES[t];
      if (!id) continue;
      el.dataset.cropImg = '1';
      var img = document.createElement('img');
      img.src = '/img/' + id + '.jpg';
      img.alt = el.textContent.trim();
      img.className = 'crop-img';
      img.addEventListener('error', function () { this.style.display = 'none'; });
      el.insertBefore(img, el.firstChild);
    }
  }
  var busy = false;
  new MutationObserver(function () {
    if (busy) return; busy = true;
    setTimeout(function () { scan(document.body); busy = false; }, 50);
  }).observe(document.body, { childList: true, subtree: true });
  scan(document.body);
})();