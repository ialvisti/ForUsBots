# Log Schema

Logger output is line-oriented JSON (or pretty for local dev). Every record carries:

| field          | type   | source                                              |
| -------------- | ------ | --------------------------------------------------- |
| ts             | string | ISO timestamp                                       |
| severity       | string | DEBUG / INFO / WARNING / ERROR (Cloud Logging native) |
| level          | string | debug / info / warn / error                         |
| service        | string | env `SERVICE_NAME` (default `forusbots`)            |
| env            | string | env `NODE_ENV`                                      |
| pid            | number | process id                                          |
| correlationId  | string | per-request UUID (auto, from AsyncLocalStorage)     |
| jobId          | string | when inside a queued job (auto)                     |
| botId          | string | when inside a queued job (auto)                     |
| type           | string | one of the closed taxonomy below                    |

## Closed taxonomy of `type`

```
http.request               http.response
job.accepted               job.started
job.succeeded              job.failed              job.canceled
job.summary
stage.start                stage.succeed           stage.fail
bot.<name>.<event>
infra.startup              infra.shutdown          infra.exit
infra.process_exit
infra.unhandled_rejection  infra.uncaught_exception
infra.server_error         infra.server_close_error
infra.secrets_load_error
audit.<event>
login.attempt
route.<name>.<event>
http.<endpoint>.<event>
```

Adding a new `type` requires code review. Don't invent ad-hoc names.

## Conventions

- Errors go in the `error` field (object: `{name, message, stack}`); never as a positional argument.
- Large payloads go in `meta` or `details`; the logger truncates while keeping shape.
- Pretty mode (`LOG_FORMAT=pretty`) is for local dev only. Production must run with `LOG_FORMAT=json`.
