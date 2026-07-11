# PlantUML Patterns

Use these as neutral fallbacks only when the project has no template. Preserve
existing project notation, fonts, palette and identifiers.

## Shared header

```plantuml
@startuml
' Diagram generated from structured requirements.
skinparam shadowing false
skinparam actorStyle stickman
skinparam ArrowColor #333333
skinparam BorderColor #333333
skinparam BackgroundColor #FFFFFF
@enduml
```

## Package overview

```plantuml
@startuml
left to right direction
skinparam shadowing false
skinparam actorStyle stickman
skinparam package {
  BackgroundColor #FFF2B8
  BorderColor #333333
}

frame "uc System Name" {
  actor "Actor Role" as A_Role

  folder "Package A" as P_A
  folder "Package B" as P_B

  A_Role ..> P_A
  P_A ..> P_B : <<use>>
}
@enduml
```

## Per-package use case diagram

```plantuml
@startuml
left to right direction
skinparam shadowing false
skinparam actorStyle stickman
skinparam usecase {
  BackgroundColor #FFF8D8
  BorderColor #333333
}

frame "uc Package Name" {
  actor "Primary Actor" as A_Primary
  actor "External System" as A_ExternalSystem

  rectangle "Package Name" {
    usecase "Main Use Case" as UC_Main
    usecase "Mandatory Helper" as UC_Helper
    usecase "Optional Extension" as UC_Extension
  }

  A_Primary -- UC_Main
  A_ExternalSystem -- UC_Helper
  UC_Main .> UC_Helper : <<include>>
  UC_Extension .> UC_Main : <<extend>>
  note on link
    <<Condition>>
    Optional condition is true.
  end note
}
@enduml
```

## Actor generalisation

```plantuml
actor "Customer" as A_Customer
actor "Bank Customer" as A_BankCustomer
actor "Foreign Customer" as A_ForeignCustomer
A_BankCustomer --|> A_Customer
A_ForeignCustomer --|> A_Customer
```

## Activity with swimlanes and decision

```plantuml
@startuml
skinparam shadowing false
skinparam activity {
  BackgroundColor #FFF2B8
  BorderColor #333333
}

title Activity Diagram — Use Case Name

|Actor|
start
:Enter Request;

|System|
:Validate Request;
if (Request Valid?) then (yes)
  :Process Request;
else (no)
  :Display Error;
  stop
endif

:Store Result;
stop
@enduml
```

## Activity with concurrent branches

```plantuml
fork
  |System|
  :Send Confirmation;
fork again
  |External Service|
  :Reserve Inventory;
end fork
```

## Optional project-defined call marker

```plantuml
:<<invoke>> Validate Payment;
```

`<<invoke>>` is not a universal UML requirement. Use it only when the project
defines that convention and the target behaviour is separately documented;
otherwise use the project's call-activity notation.
