async function generate() {

  const number =
    document.getElementById("number").value;

  const result =
    document.getElementById("result");

  result.innerHTML = "Generating...";

  const req = await fetch("/pair", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      number
    })
  });

  const res = await req.json();

  if (res.status) {
    result.innerHTML =
      `CODE: ${res.code}`;
  } else {
    result.innerHTML =
      res.msg;
  }
}
