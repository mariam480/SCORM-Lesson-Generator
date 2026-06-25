// version: 7.12.0.a.1.6.2
// sha: 0fe677852b6ba8d728f92f6cc7053b408bc05449
function SetBookmark(){var o=window.parent,t=window.location.href;o.SetBookmark(t.substring(t.toLowerCase().lastIndexOf("/scormcontent/")+14,t.length),document.title),o.CommitData()}SetBookmark();