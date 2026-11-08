/*
   Licensed under the Apache License v2.0.
            
   A copy of which can be found at the root of this distrubution in 
   the file LICENSE-2.0 or at http://www.apache.org/licenses/LICENSE-2.0
*/

(function (window) {

  var jetzt  = window.jetzt
    , H      = jetzt.helpers
    , config = jetzt.config;

  function on (event, cb) {
    window.addEventListener(event, cb);
  }

  function off (event, cb) {
    window.removeEventListener(event, cb);
  }

  function caretAt (x, y) {
    if (document.caretRangeFromPoint) {
      var range = document.caretRangeFromPoint(x, y);
      return range && { node: range.startContainer, offset: range.startOffset };
    } else if (document.caretPositionFromPoint) {
      var pos = document.caretPositionFromPoint(x, y);
      return pos && { node: pos.offsetNode, offset: pos.offset };
    }
    return null;
  }

  // index where the sentence containing offset begins
  function sentenceStart (text, offset) {
    var re = /[.?!…]["'”’»)]*\s+/g
      , start = 0
      , match;
    while ((match = re.exec(text)) && match.index + match[0].length <= offset) {
      start = match.index + match[0].length;
    }
    return start;
  }

  // index where the sentence containing offset ends
  function sentenceEnd (text, offset) {
    var re = /[.?!…]["'”’»)]*(?=\s|$)/g;
    re.lastIndex = offset;
    var match = re.exec(text);
    return match ? match.index + match[0].length : text.length;
  }

  /**
   * Begin interactive dom node selection.
   */
  function selectMode () {
    var selection = [];
    var previousElement = null;
    var pointer = null;
    var rectOverlays = [];

    var showSelection = function () {

      overlays = [];

      for (var i=0, len=selection.length; i < len; i++) {
        if (!jetzt.view.addOverlay(selection[i])) {
          break;
        }
      }
    };

    var clearRects = function () {
      rectOverlays.forEach(function (el) { el.remove(); });
      rectOverlays = [];
    };

    var drawRects = function (rects) {
      for (var i = 0; i < rects.length; i++) {
        var rect = rects[i]
          , overlay = H.div("sr-overlay");
        overlay.style.top = (H.getScrollTop() + rect.top) + "px";
        overlay.style.left = (H.getScrollLeft() + rect.left) + "px";
        overlay.style.width = rect.width + "px";
        overlay.style.height = rect.height + "px";
        overlay.style.backgroundColor = config("selection_color");
        document.body.appendChild(overlay);
        rectOverlays.push(overlay);
      }
    };

    var sentenceRects = function (x, y) {
      var caret = caretAt(x, y);
      if (!caret || caret.node.nodeType !== 3) return null;

      var inSelection = selection.some(function (el) {
        return el.contains(caret.node);
      });
      if (!inSelection) return null;

      var range = document.createRange();
      range.setStart(caret.node, sentenceStart(caret.node.data, caret.offset));
      range.setEnd(caret.node, sentenceEnd(caret.node.data, caret.offset));
      return range.getClientRects();
    };

    var highlight = function () {
      jetzt.view.removeAllOverlays();
      clearRects();

      var rects = pointer && sentenceRects(pointer.x, pointer.y);
      if (rects && rects.length > 0) {
        drawRects(rects);
      } else {
        showSelection();
      }
    };

    var setSelection = function (sel) {
      selection = sel;
      highlight();
    };

    var validParents = {
      "DIV": true,
      "ARTICLE": true,
      "BLOCKQUOTE": true,
      "MAIN": true,
      "SECTION": true,
      "UL": true,
      "OL": true,
      "DL": true
    };

    var validChildren = {
      "P": true,
      "H1": true,
      "H2": true,
      "H3": true,
      "H4": true,
      "H5": true,
      "H6": true,
      "SPAN": true,
      "DL": true,
      "OL": true,
      "UL": true,
      "BLOCKQUOTE": true,
      "SECTION": true
    };

    var selectSiblings = function (el) {
      var firstChild = el;
      var parent = el.parentNode;
      while (parent && !validParents[parent.tagName]) {
        firstChild = parent;
        parent = firstChild.parentNode;

      }

      if (parent) {
        var kids = parent.childNodes
          , len = kids.length
          , result = []
          , i = 0;

          while (kids[i] !== firstChild) i++;

          for (; i < len; i++) {
            var kid = kids[i];
            if (validChildren[kid.tagName]) {
              result.push(kid);
            }
          }

          return result;

      } else {
        return [el];
      }
    };

    var stop = function () {
      jetzt.view.removeAllOverlays();
      clearRects();
      off("mouseover", mouseoverHandler);
      off("mousemove", moveHandler);
      off("keydown", keydownHandler);
      off("keyup", keyupHandler);
      off("click", clickHandler);
      previousElement && H.removeClass(previousElement, "sr-pointer");
    };

    var mouseoverHandler = function (ev) {
      pointer = { x: ev.clientX, y: ev.clientY };
      previousElement && H.removeClass(previousElement, "sr-pointer");

      H.addClass(ev.target, "sr-pointer");

      previousElement = ev.target;

      if (ev.altKey) {
        setSelection([ev.target]);
      } else {
        setSelection(selectSiblings(ev.target));
      }
    };

    var clickHandler = function (ev) {
      stop();
      jetzt.init(jetzt.parse.dom(startingNodes(ev.clientX, ev.clientY) || selection));
    };

    var startingNodes = function (x, y) {
      var caret = caretAt(x, y);
      if (!caret || caret.node.nodeType !== 3) return null;

      var idx = -1;
      for (var i = 0; i < selection.length; i++) {
        if (selection[i].contains(caret.node)) {
          idx = i;
          break;
        }
      }
      if (idx < 0) return null;

      var range = document.createRange();
      range.setStart(caret.node, sentenceStart(caret.node.data, caret.offset));
      range.setEnd(selection[idx], selection[idx].childNodes.length);

      var partial = selection[idx].cloneNode(false);
      partial.appendChild(range.cloneContents());
      return [partial].concat(selection.slice(idx + 1));
    };

    var moveHandler = function (ev) {
      if (!pointer) mouseoverHandler(ev);
      pointer = { x: ev.clientX, y: ev.clientY };
      highlight();
    };

    var keydownHandler = function (ev) {
      if (ev.keyCode === 27) {
        stop();
      } else if (ev.altKey && selection.length > 1) {
        setSelection([selection[0]]);
      }
    };

    var keyupHandler = function (ev) {
      if (!ev.altKey && selection.length === 1) {
        setSelection(selectSiblings(selection[0]));
      }
    };

    on("mouseover", mouseoverHandler);
    on("click", clickHandler);
    on("mousemove", moveHandler);
    on("keydown", keydownHandler);
    on("keyup", keyupHandler);
  }

  jetzt.select = function (contextData) {
    var text;
    if (contextData === undefined) {
      text = window.getSelection().toString();
    } else {
      text = contextData.selectionText;
    }
    if (text.trim().length > 0) {
      jetzt.init(jetzt.parse.string(text));
      window.getSelection().removeAllRanges();
    } else {
      selectMode();
    }
  };

})(this);


