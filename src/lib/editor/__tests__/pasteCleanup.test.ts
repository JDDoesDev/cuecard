/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from 'vitest';
import { Editor } from '@tiptap/core';
import { cleanPastedHtml } from '../pasteCleanup';
import { getEditorExtensions } from '../tiptapSchema';
import { tiptapToSlide } from '../tiptapToSlide';
import { BUILT_IN_FONTS } from '@/lib/fonts/availableFonts';
import type { Slide, TextElement } from '@/types/slide';

// Captured clipboard HTML (trimmed of the CF_HTML header and most of Word's <style> block)

const WORD_HTML = `<html xmlns:v="urn:schemas-microsoft-com:vml"
xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:w="urn:schemas-microsoft-com:office:word"
xmlns:m="http://schemas.microsoft.com/office/2004/12/omml"
xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta http-equiv=Content-Type content="text/html; charset=utf-8">
<meta name=ProgId content=Word.Document>
<meta name=Generator content="Microsoft Word 15">
<link rel=File-List href="file:///C:/Users/me/AppData/Local/Temp/msohtmlclip1/01/clip_filelist.xml">
<!--[if gte mso 9]><xml>
 <o:OfficeDocumentSettings>
  <o:AllowPNG/>
 </o:OfficeDocumentSettings>
</xml><![endif]-->
<style>
<!--
 /* Style Definitions */
 p.MsoNormal, li.MsoNormal, div.MsoNormal
	{mso-style-unhide:no;
	margin-top:0in;
	margin-bottom:8.0pt;
	font-size:11.0pt;
	font-family:"Calibri",sans-serif;}
-->
</style>
</head>
<body lang=EN-US style='tab-interval:.5in;word-wrap:break-word'>
<!--StartFragment-->
<h1><span style='mso-fareast-font-family:"Times New Roman"'>Quarterly Report<o:p></o:p></span></h1>
<p class=MsoNormal><b><span style='font-size:14.0pt;line-height:107%;font-family:"Arial",sans-serif;color:black'>Bold</span></b><span style='font-size:14.0pt'> and <i>italic</i> and <u>underlined</u> with <span style='color:#C00000'>red text</span> and <span style='background:yellow;mso-highlight:yellow'>highlight</span> and a <a href="https://example.com/page">link</a>.<o:p></o:p></span></p>
<p class=MsoListParagraphCxSpFirst style='text-indent:-.25in;mso-list:l0 level1 lfo1'><![if !supportLists]><span style='font-family:Symbol;mso-fareast-font-family:Symbol;mso-bidi-font-family:Symbol'><span style='mso-list:Ignore'>·<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; </span></span></span><![endif]>First bullet<o:p></o:p></p>
<p class=MsoListParagraphCxSpMiddle style='margin-left:1.0in;mso-add-space:auto;text-indent:-.25in;mso-list:l0 level2 lfo1'><![if !supportLists]><span style='font-family:"Courier New";mso-fareast-font-family:"Courier New"'><span style='mso-list:Ignore'>o<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp; </span></span></span><![endif]>Nested bullet<o:p></o:p></p>
<p class=MsoListParagraphCxSpLast style='text-indent:-.25in;mso-list:l0 level1 lfo1'><![if !supportLists]><span style='font-family:Symbol;mso-fareast-font-family:Symbol;mso-bidi-font-family:Symbol'><span style='mso-list:Ignore'>·<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; </span></span></span><![endif]>Second bullet<o:p></o:p></p>
<p class=MsoNormal><o:p>&nbsp;</o:p></p>
<p class=MsoListParagraphCxSpFirst style='text-indent:-.25in;mso-list:l1 level1 lfo2'><![if !supportLists]><span style='mso-list:Ignore'>1.<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; </span></span><![endif]>Step one<o:p></o:p></p>
<p class=MsoListParagraphCxSpLast style='text-indent:-.25in;mso-list:l1 level1 lfo2'><![if !supportLists]><span style='mso-list:Ignore'>2.<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; </span></span><![endif]>Step two<o:p></o:p></p>
<table class=MsoTableGrid border=1 cellspacing=0 cellpadding=0
 style='border-collapse:collapse;border:none;mso-border-alt:solid windowtext .5pt;
 mso-yfti-tbllook:1184;mso-padding-alt:0in 5.4pt 0in 5.4pt'>
 <tr style='mso-yfti-irow:0;mso-yfti-firstrow:yes'>
  <td width=312 valign=top style='width:233.75pt;border:solid windowtext 1.0pt;padding:0in 5.4pt 0in 5.4pt'>
  <p class=MsoNormal style='margin-bottom:0in;line-height:normal'><b>Name<o:p></o:p></b></p>
  </td>
  <td width=312 valign=top style='width:233.75pt;border:solid windowtext 1.0pt;padding:0in 5.4pt 0in 5.4pt'>
  <p class=MsoNormal style='margin-bottom:0in;line-height:normal'><b>Value<o:p></o:p></b></p>
  </td>
 </tr>
 <tr style='mso-yfti-irow:1;mso-yfti-lastrow:yes'>
  <td width=312 valign=top style='width:233.75pt;border:solid windowtext 1.0pt;padding:0in 5.4pt 0in 5.4pt'>
  <p class=MsoNormal style='margin-bottom:0in;line-height:normal'>Alpha<o:p></o:p></p>
  </td>
  <td width=312 valign=top style='width:233.75pt;border:solid windowtext 1.0pt;padding:0in 5.4pt 0in 5.4pt'>
  <p class=MsoNormal align=center style='margin-bottom:0in;text-align:center;line-height:normal'>42<o:p></o:p></p>
  </td>
 </tr>
</table>
<p class=MsoNormal><!--[if gte vml 1]><v:shape id="Picture_x0020_1" o:spid="_x0000_i1025" type="#_x0000_t75"><v:imagedata src="file:///C:/Users/me/AppData/Local/Temp/msohtmlclip1/01/clip_image001.png" o:title=""/></v:shape><![endif]--><![if !vml]><img width=100 height=100 src="file:///C:/Users/me/AppData/Local/Temp/msohtmlclip1/01/clip_image002.png" v:shapes="Picture_x0020_1"><![endif]>After image<o:p></o:p></p>
<!--EndFragment-->
</body>
</html>`;

const GDOCS_HTML = `<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-4f1c2a3b-7fff-1d2e-9a8b-0c1d2e3f4a5b"><h2 dir="ltr" style="line-height:1.38;margin-top:18pt;margin-bottom:6pt;"><span style="font-size:16pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">Project Plan</span></h2><p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;"><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:700;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">Bold</span><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;"> then </span><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:italic;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">italic</span><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">, </span><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;font-variant:normal;text-decoration:underline;-webkit-text-decoration-skip:none;text-decoration-skip-ink:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">underline</span><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">, </span><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;font-variant:normal;text-decoration:line-through;-webkit-text-decoration-skip:none;text-decoration-skip-ink:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">struck</span><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;"> and </span><span style="font-size:11pt;font-family:Lato,sans-serif;color:#1155cc;background-color:#ffff00;font-weight:400;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">Lato blue on yellow</span><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;"> with </span><a href="https://docs.example.com/x" style="text-decoration:none;"><span style="font-size:11pt;font-family:Arial,sans-serif;color:#1155cc;background-color:transparent;font-weight:400;font-style:normal;font-variant:normal;text-decoration:underline;-webkit-text-decoration-skip:none;text-decoration-skip-ink:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">a link</span></a><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">.</span></p><ul style="margin-top:0;margin-bottom:0;padding-inline-start:48px;"><li dir="ltr" style="list-style-type:disc;font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;" aria-level="1"><p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;" role="presentation"><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">Item one</span></p></li><ul style="margin-top:0;margin-bottom:0;padding-inline-start:48px;"><li dir="ltr" style="list-style-type:circle;font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;" aria-level="2"><p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;" role="presentation"><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">Sub item</span></p></li></ul></ul><br /><div dir="ltr" style="margin-left:0pt;" align="left"><table style="border:none;border-collapse:collapse;"><colgroup><col width="301" /><col width="301" /></colgroup><tbody><tr style="height:0pt"><td style="border-left:solid #000000 1pt;border-right:solid #000000 1pt;border-bottom:solid #000000 1pt;border-top:solid #000000 1pt;vertical-align:top;padding:5pt 5pt 5pt 5pt;overflow:hidden;overflow-wrap:break-word;"><p dir="ltr" style="line-height:1.2;margin-top:0pt;margin-bottom:0pt;"><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:700;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">Col A</span></p></td><td style="border-left:solid #000000 1pt;border-right:solid #000000 1pt;border-bottom:solid #000000 1pt;border-top:solid #000000 1pt;vertical-align:top;padding:5pt 5pt 5pt 5pt;overflow:hidden;overflow-wrap:break-word;"><p dir="ltr" style="line-height:1.2;margin-top:0pt;margin-bottom:0pt;"><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">Col B</span></p></td></tr></tbody></table></div><p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;"><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">x</span><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:super;white-space:pre;white-space:pre-wrap;">2</span><span style="border:none;display:inline-block;overflow:hidden;width:120px;height:80px;"><img src="https://lh7-us.googleusercontent.com/abc" width="120" height="80" style="margin-left:0px;margin-top:0px;" /></span></p></b><br class="Apple-interchange-newline">`;

const WEB_HTML = `<div class="article" style="position:absolute;top:10px;padding:20px"><h3 id="intro" class="title" style="font-size:24px">Intro</h3><p style="margin:0 0 1em;font-size:18px;color:rgb(51, 51, 51)" class="lead">Read <a href="javascript:alert(1)" onclick="steal()">this</a> and <a href="https://ok.example" target="_blank" class="ext">that</a>.</p><script>alert(1)</script><img src="x.png" onerror="alert(1)"><font face="Comic Sans MS" color="#000000">Old font tag</font></div>`;

const fonts = BUILT_IN_FONTS;

describe('cleanPastedHtml: Microsoft Word', () => {
  const out = cleanPastedHtml(WORD_HTML, { availableFonts: fonts });

  it('removes Office markup', () => {
    expect(out).not.toMatch(/mso-|Mso|<o:p|o:p>|<!--|<!\[|<font|<style|<meta|<link|<xml|class=|lang=/i);
    expect(out).not.toMatch(/Times New Roman|Calibri|font-size/i);
  });

  it('turns the heading into a bold paragraph', () => {
    expect(out).toContain('<p><strong>Quarterly Report</strong></p>');
  });

  it('keeps inline formatting, non-default colors, highlight and links', () => {
    expect(out).toContain('<b>Bold</b>');
    expect(out).toContain('<i>italic</i>');
    expect(out).toContain('<u>underlined</u>');
    expect(out).toContain('<span style="color: #C00000;">red text</span>');
    expect(out).toContain('<mark data-color="yellow" style="background-color: yellow;">highlight</mark>');
    expect(out).toContain('<a href="https://example.com/page">link</a>');
    // color:black is the document default and is dropped
    expect(out).not.toMatch(/color: black/);
  });

  it('converts Word list paragraphs into nested lists', () => {
    expect(out).toContain('<ul><li>First bullet<ul><li>Nested bullet</li></ul></li><li>Second bullet</li></ul>');
    expect(out).toContain('<ol><li>Step one</li><li>Step two</li></ol>');
    expect(out).not.toContain('·');
  });

  it('keeps tables without Word sizing/borders', () => {
    expect(out).toMatch(/<table>\s*<tbody>\s*<tr>\s*<td>\s*<p><b>Name<\/b><\/p>/);
    expect(out).toContain('<p style="text-align: center;">42</p>');
    expect(out).not.toMatch(/width|border|cellpadding|valign/);
  });

  it('drops images (text elements cannot hold them)', () => {
    expect(out).not.toMatch(/<img|v:shape|imagedata/);
    expect(out).toContain('After image');
  });
});

describe('cleanPastedHtml: Google Docs', () => {
  const out = cleanPastedHtml(GDOCS_HTML, { availableFonts: fonts });

  it('unwraps the docs-internal-guid wrapper and drops sizes, defaults and spacing', () => {
    expect(out).not.toMatch(/docs-internal-guid|font-weight|font-size|line-height|margin|padding|white-space|dir=|role=|aria-level|#000000|transparent|Arial/);
    expect(out).not.toContain('Apple-interchange-newline');
  });

  it('converts style spans to semantic marks', () => {
    expect(out).toContain('<p><strong>Project Plan</strong></p>');
    expect(out).toContain('<strong>Bold</strong> then <em>italic</em>, <u>underline</u>, <s>struck</s> and ');
    expect(out).toContain('x<sup>2</sup>');
  });

  it('keeps available fonts, non-default colors, highlight and links', () => {
    expect(out).toContain(
      '<span style="color: #1155cc; font-family: &quot;Lato&quot;, sans-serif;"><mark data-color="#ffff00" style="background-color: #ffff00;">Lato blue on yellow</mark></span>',
    );
    expect(out).toContain('<a href="https://docs.example.com/x"><span style="color: #1155cc;"><u>a link</u></span></a>');
  });

  it('keeps nested lists and tables, drops images', () => {
    expect(out).toContain('<ul><li>Item one</li><ul><li>Sub item</li></ul></ul>');
    expect(out).toContain('<table><tbody><tr><td><p><strong>Col A</strong></p></td><td><p>Col B</p></td></tr></tbody></table>');
    expect(out).not.toMatch(/<img|<colgroup|googleusercontent/);
  });
});

describe('cleanPastedHtml: web pages', () => {
  const out = cleanPastedHtml(WEB_HTML, { availableFonts: fonts });

  it('strips scripts, unsafe links, classes, ids, positioning and font tags', () => {
    expect(out).not.toMatch(/script|javascript|onclick|onerror|class=|id=|position|padding|font-size|<font|<img|target=/i);
    expect(out).toContain('<p><strong>Intro</strong></p>');
    expect(out).toContain('<p>Read this and <a href="https://ok.example">that</a>.</p>');
    expect(out).toContain('Old font tag');
  });

  it('keeps meaningful colors only', () => {
    expect(out).not.toContain('rgb(51, 51, 51)');
    expect(cleanPastedHtml('<p><span style="color: rgb(0, 0, 0)">a</span><span style="color: rgb(200, 0, 0)">b</span></p>')).toBe(
      '<p>a<span style="color: rgb(200, 0, 0);">b</span></p>',
    );
  });

  it('leaves the editor\'s own clipboard HTML alone', () => {
    const html = '<p data-pm-slice="1 1 []"><span style="font-size: 3.2cqw;">big</span></p>';
    expect(cleanPastedHtml(html)).toBe(html);
  });

  it('leaves simple markup unchanged', () => {
    expect(cleanPastedHtml('<p>Hello <strong>world</strong></p>')).toBe('<p>Hello <strong>world</strong></p>');
  });
});

describe('paste through a real editor', () => {
  // jsdom has no ClipboardEvent; ProseMirror's pasteHTML/pasteText create one
  const g = globalThis as { ClipboardEvent?: unknown };
  g.ClipboardEvent ??= class extends Event {
    clipboardData = null;
  };

  let editor: Editor | null = null;
  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  const el: TextElement = { id: 't', type: 'text', position: { x: 0, y: 0, width: 50, height: 50 }, content: '' };
  const slide: Slide = { id: 's', layout: 'freestyle', transition: 'none', elements: [el] };

  it('pastes cleaned Google Docs content into a text element', () => {
    editor = new Editor({ extensions: getEditorExtensions(), content: '<p></p>' });
    editor.view.pasteHTML(GDOCS_HTML);
    const content = (tiptapToSlide(editor.getHTML(), slide, 0).elements[0] as TextElement).content;
    expect(content).toContain('<p><strong>Project Plan</strong></p>');
    expect(content).toContain('<strong>Bold</strong> then <em>italic</em>, <u>underline</u>, <s>struck</s>');
    expect(content).toContain('<a href="https://docs.example.com/x">');
    expect(content).toContain('font-family: &quot;Lato&quot;, sans-serif;');
    expect(content).toContain('<mark data-color="#ffff00"');
    expect(content).toContain('<li><p>Item one</p><ul><li><p>Sub item</p></li></ul></li>');
    expect(content).toContain('<table><tbody><tr><td><strong>Col A</strong></td><td>Col B</td></tr></tbody></table>');
    expect(content).not.toMatch(/<img|font-size|Arial|docs-internal/);
  });

  it('pastes cleaned Word content into a text element', () => {
    editor = new Editor({ extensions: getEditorExtensions(), content: '<p></p>' });
    editor.view.pasteHTML(WORD_HTML);
    const content = (tiptapToSlide(editor.getHTML(), slide, 0).elements[0] as TextElement).content;
    expect(content).toContain('<ul><li><p>First bullet</p><ul><li><p>Nested bullet</p></li></ul></li><li><p>Second bullet</p></li></ul>');
    expect(content).toContain('<ol><li><p>Step one</p></li><li><p>Step two</p></li></ol>');
    expect(content).toContain('<span style="color: rgb(192, 0, 0);">red text</span>');
    expect(content).not.toMatch(/mso|Mso|<img/);
  });

  it('leaves plain-text paste unchanged', () => {
    editor = new Editor({ extensions: getEditorExtensions(), content: '<p></p>' });
    editor.view.pasteText('plain text <b>not html</b>');
    expect(editor.getHTML()).toBe('<p>plain text &lt;b&gt;not html&lt;/b&gt;</p>');
  });
});

describe('paste cleanup: style injection', () => {
  it('rejects colors that smuggle declarations', () => {
    const out = cleanPastedHtml('<p><mark data-color="yellow;position:fixed;background:url(https://t.example)">a</mark><span style="color: red;position:fixed">b</span></p>');
    expect(out).not.toMatch(/position|url\(|t\.example/);
    expect(out).toContain('<span style="color: red;">b</span>');
  });

  it('only trusts real ProseMirror clipboard HTML, and still filters its styles', () => {
    const fake = '<p>x</p><div data-pm-slice="1 1 []" style="position:fixed">y</div>';
    expect(cleanPastedHtml(fake)).toBe('<p>x</p><p>y</p>');
    const pm = '<p data-pm-slice="1 1 []" style="line-height: 2; position: fixed"><span style="font-size: 3.2cqw;">big</span></p>';
    expect(cleanPastedHtml(pm)).toBe('<p data-pm-slice="1 1 []" style="line-height: 2;"><span style="font-size: 3.2cqw;">big</span></p>');
  });
});
