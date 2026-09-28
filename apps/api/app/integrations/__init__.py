"""Outbound integrations for the notebooks' external sources (D-97).

Everything in this package talks to a server the project does not run, so two
rules hold for every module in it:

* **No module opens its own connection.** Each one receives an ``httpx.Client``
  built by :func:`app.integrations.http.build_client`, which is what lets the
  tests swap the transport for ``httpx.MockTransport`` and never touch the
  network.
* **Only** :mod:`app.integrations.safe_fetch` **fetches a URL a student typed.**
  The other modules call fixed public API hosts; an arbitrary address goes
  through the SSRF policy in ``safe_fetch`` or it does not go out at all.
"""
