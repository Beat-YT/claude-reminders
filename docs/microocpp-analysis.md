# MicroOcpp Library Analysis

## Overview

MicroOcpp is a portable OCPP 1.6 / 2.0.1 client library in C/C++. It handles all OCPP protocol logic (WebSocket messaging, message queuing, retries, transaction state machines, status notifications, smart charging profiles, local authorization, reservations, configuration) while the user supplies hardware-specific glue through callbacks ("Inputs" and "Outputs").

## Core Lifecycle

```cpp
#include <MicroOcpp.h>

// 1. Init
mocpp_initialize(connection, ChargerCredentials("My Model", "My Vendor"));

// 2. Call every main loop iteration
mocpp_loop();

// 3. Teardown (optional)
mocpp_deinitialize();
```

Two `mocpp_initialize` overloads:
- **Arduino convenience**: pass URL string directly (library manages WebSocket via links2004/WebSockets)
- **Custom connection**: subclass `MicroOcpp::Connection` (implement `loop()`, `sendTXT()`, `setReceiveTXTcallback()`, `isConnected()`, `getLastConnected()`) for non-Arduino platforms

## Hardware Integration (Inputs/Outputs)

All optional. Call setters once during setup after `mocpp_initialize()`.

### Inputs (Library Reads From You)

| Setter | Callback Signature | Purpose | If Not Set |
|---|---|---|---|
| `setConnectorPluggedInput` | `bool()` | Is EV plugged in? | Transactions start immediately on auth (no plug wait) |
| `setEnergyMeterInput` | `int()` | Energy register (Wh) | meterStart/meterStop omitted, no energy in MeterValues |
| `setPowerMeterInput` | `float()` | Instantaneous power (W) | No power in MeterValues |
| `setEvReadyInput` | `bool()` | EV drawing current (J1772 State C) | Simpler status logic, no SuspendedEV distinction |
| `setEvseReadyInput` | `bool()` | EVSE relay/PWM active | No SuspendedEVSE reporting |
| `addMeterValueInput` | `float(), measurand, unit, location, phase` | Any additional meter value (voltage, current, temp, SoC) | That measurand simply absent from MeterValues |
| `addErrorCodeInput` | `const char*()` | OCPP error codes | Always reports NoError |
| `setOccupiedInput` | `bool()` | Override Available to Preparing/Finishing | Reports Available when idle |
| `setStartTxReadyInput` | `bool()` | Gate StartTransaction | No gating, tx starts when auth+plug satisfied |
| `setStopTxReadyInput` | `bool()` | Gate StopTransaction | No gating |

### Outputs (Library Writes To You)

| Setter | Callback Signature | Purpose |
|---|---|---|
| `setSmartChargingPowerOutput` | `void(float)` | Charging limit in W (-1 = no limit) |
| `setSmartChargingCurrentOutput` | `void(float)` | Charging limit in A (-1 = no limit) |
| `setSmartChargingOutput` | `void(float,float,int)` | Combined: watts, amps, num phases |
| `setTxNotificationOutput` | `void(Transaction*,TxNotification)` | Transaction lifecycle events |
| `setOnResetExecute` | `void(bool)` | Handle Reset command (reboot device) |
| `setOnResetNotify` | `bool(bool)` | Veto a Reset before it happens |
| `setOnUnlockConnectorInOut` | `UnlockConnectorResult()` | Handle UnlockConnector command |

## Transaction Management

```cpp
beginTransaction("RFID_TAG", connectorId);        // auth + start
beginTransaction_authorized("TAG", nullptr, cId);  // skip auth
endTransaction("RFID_TAG", "Local", connectorId);  // stop
endTransaction_authorized("TAG", "Local", cId);     // skip auth check

// Query state
ocppPermitsCharge(connectorId);   // should relay be closed?
isTransactionRunning(connectorId);
isTransactionActive(connectorId);
getTransaction(connectorId);      // shared_ptr<Transaction>
```

The library handles Authorize, StartTransaction, periodic MeterValues, StopTransaction, and StatusNotification automatically.

## Transaction State Machine

| State | isTransactionActive() | isTransactionRunning() |
|---|---|---|
| Preparing | true | false |
| Running | true | true |
| Running/StopTxAwait | false | true |
| Finished/Aborted/Idle | false | false |

## TxNotification Events

- `TxNotification_Authorized` / `_AuthorizationRejected` / `_AuthorizationTimeout`
- `TxNotification_ReservationConflict`
- `TxNotification_ConnectionTimeout`
- `TxNotification_DeAuthorized`
- `TxNotification_RemoteStart` / `_RemoteStop`
- `TxNotification_StartTx` / `_StopTx`

## OCPP Message Hooks

```cpp
// React to incoming server messages
setOnReceiveRequest("SetChargingProfile", [](JsonObject payload) { ... });

// React to outgoing confirmations
setOnSendConf("RemoteStopTransaction", [](JsonObject payload) { ... });

// Send custom operations (e.g. DataTransfer)
sendRequest("DataTransfer", createReqFn, processConfFn);

// Replace built-in handlers entirely
setRequestHandler("DataTransfer", processReqFn, createConfFn);
```

## Key OCPP Configuration Variables

Automatically managed and exposed via GetConfiguration/ChangeConfiguration:

- `ConnectionTimeOut` (30s) - timeout for Preparing state
- `StopTransactionOnEVSideDisconnect` (true)
- `LocalPreAuthorize` (false)
- `LocalAuthorizeOffline` (true)
- `MO_FreeVendActive` (false) - auto-start tx on plug-in
- `MO_FreeVendIdTag` ("") - idTag for FreeVend
- `MO_TxStartOnPowerPathClosed` (false) - postpone tx start to power path closed

## C API

Everything available via `MicroOcpp_c.h` with `ocpp_` prefix and C function pointers. Multi-connector variants suffixed `_m`.

## Minimum Viable Integration

```cpp
void setup() {
    mocpp_initialize(connection, ChargerCredentials("Model", "Vendor"));
}

void loop() {
    mocpp_loop();
    if (ocppPermitsCharge()) { energize(); } else { deenergize(); }
    if (rfidDetected) {
        if (!getTransaction()) beginTransaction(tag);
        else endTransaction(tag);
    }
}
```

Everything else (metering, smart charging, plug detection, error reporting) is optional and gracefully degrades when not provided.
