;; LeaseFactory.clar
;; Core contract for creating and managing geothermal energy lease agreements.
;; This contract acts as a factory for lease instances, using maps to simulate
;; multiple lease "contracts" with immutable terms, extraction limits, pricing,
;; and integration points for logging, verification, and payments.

;; Constants
(define-constant ERR-UNAUTHORIZED u100)
(define-constant ERR-INVALID-PARAMS u101)
(define-constant ERR-LEASE-EXISTS u102)
(define-constant ERR-LEASE-NOT-FOUND u103)
(define-constant ERR-LEASE-NOT-ACTIVE u104)
(define-constant ERR-INVALID-STATE u105)
(define-constant ERR-EXTRACTION-CAP-EXCEEDED u106)
(define-constant ERR-INVALID-DURATION u107)
(define-constant ERR-INVALID-PRICING u108)
(define-constant ERR-NOT-LESSOR u109)
(define-constant ERR-NOT-LESSEE u110)
(define-constant ERR-ALREADY-ACCEPTED u111)
(define-constant ERR-LEASE-EXPIRED u112)
(define-constant ERR-INVALID-RESOURCE-TYPE u113)
(define-constant ERR-MAX-ENV-CONSTRAINTS u114)
(define-constant ERR-INVALID-ORACLE u115)

(define-constant LEASE-STATE-PENDING u0)
(define-constant LEASE-STATE-ACTIVE u1)
(define-constant LEASE-STATE-EXPIRED u2)
(define-constant LEASE-STATE-TERMINATED u3)

(define-constant RESOURCE-TYPE-HEAT u1) ;; Geothermal heat
(define-constant RESOURCE-TYPE-WATER u2) ;; Geothermal fluid
(define-constant RESOURCE-TYPE-POWER u3) ;; Generated power

(define-constant MAX-ENV-CONSTRAINTS u5) ;; Max environmental constraints per lease
(define-constant MAX-DURATION-BLOCKS u1051200) ;; Approx 3 years (assuming 10-min blocks)
(define-constant MIN-DURATION-BLOCKS u144) ;; 1 day

;; Data Variables
(define-data-var next-lease-id uint u0)
(define-data-var admin principal tx-sender)
(define-data-var oracle-principal principal tx-sender) ;; Default to deployer, can be updated

;; Data Maps
(define-map leases
  { lease-id: uint }
  {
    lessor: principal,                ;; Resource owner
    lessee: (optional principal),     ;; Energy company (set upon acceptance)
    start-block: uint,
    duration-blocks: uint,            ;; Lease duration in blocks
    extraction-cap: uint,             ;; Max extraction limit (e.g., in cubic meters or MWh)
    resource-type: uint,              ;; Type of resource (HEAT, WATER, POWER)
    price-per-unit: uint,             ;; Price in micro-STX per unit extracted
    state: uint,                      ;; Pending, Active, Expired, Terminated
    env-constraints: (list 5 { metric: (string-ascii 32), max-value: uint }), ;; e.g., { "reinjection-rate", 90 }
    metadata: (string-utf8 512)       ;; Additional lease details
  }
)

(define-map lease-usage
  { lease-id: uint }
  {
    current-extraction: uint,         ;; Cumulative extraction logged
    last-log-block: uint,
    pending-payments: uint            ;; Accumulated payments due
  }
)

(define-map lease-auditors
  { lease-id: uint, auditor: principal }
  {
    added-at: uint,
    permissions: (list 3 (string-ascii 32)) ;; e.g., "view-logs", "verify-compliance"
  }
)

;; Private Functions
(define-private (is-admin (caller principal))
  (is-eq caller (var-get admin))
)

(define-private (is-lessor (lease-id uint) (caller principal))
  (match (map-get? leases { lease-id: lease-id })
    lease (is-eq (get lessor lease) caller)
    false
  )
)

(define-private (is-lessee (lease-id uint) (caller principal))
  (match (map-get? leases { lease-id: lease-id })
    lease (match (get lessee lease)
            some-lessee (is-eq some-lessee caller)
            false)
    false
  )
)

(define-private (validate-duration (duration uint))
  (and (>= duration MIN-DURATION-BLOCKS) (<= duration MAX-DURATION-BLOCKS))
)

(define-private (validate-resource-type (resource uint))
  (or (is-eq resource RESOURCE-TYPE-HEAT)
      (is-eq resource RESOURCE-TYPE-WATER)
      (is-eq resource RESOURCE-TYPE-POWER))
)

(define-private (validate-env-constraints (constraints (list 5 { metric: (string-ascii 32), max-value: uint })))
  (<= (len constraints) MAX-ENV-CONSTRAINTS)
)

(define-private (increment-lease-id)
  (let ((current-id (var-get next-lease-id)))
    (var-set next-lease-id (+ current-id u1))
    current-id
  )
)

;; Public Functions
(define-public (create-lease
  (duration uint)
  (extraction-cap uint)
  (resource-type uint)
  (price-per-unit uint)
  (env-constraints (list 5 { metric: (string-ascii 32), max-value: uint }))
  (metadata (string-utf8 512)))
  (begin
    (asserts! (validate-duration duration) (err ERR-INVALID-DURATION))
    (asserts! (> extraction-cap u0) (err ERR-INVALID-PARAMS))
    (asserts! (validate-resource-type resource-type) (err ERR-INVALID-RESOURCE-TYPE))
    (asserts! (> price-per-unit u0) (err ERR-INVALID-PRICING))
    (asserts! (validate-env-constraints env-constraints) (err ERR-MAX-ENV-CONSTRAINTS))
    (let ((lease-id (increment-lease-id)))
      (map-set leases
        { lease-id: lease-id }
        {
          lessor: tx-sender,
          lessee: none,
          start-block: block-height,
          duration-blocks: duration,
          extraction-cap: extraction-cap,
          resource-type: resource-type,
          price-per-unit: price-per-unit,
          state: LEASE-STATE-PENDING,
          env-constraints: env-constraints,
          metadata: metadata
        }
      )
      (map-set lease-usage
        { lease-id: lease-id }
        {
          current-extraction: u0,
          last-log-block: block-height,
          pending-payments: u0
        }
      )
      (print { event: "lease-created", lease-id: lease-id, lessor: tx-sender })
      (ok lease-id)
    )
  )
)

(define-public (accept-lease (lease-id uint))
  (match (map-get? leases { lease-id: lease-id })
    lease
    (begin
      (asserts! (is-eq (get state lease) LEASE-STATE-PENDING) (err ERR-INVALID-STATE))
      (asserts! (is-none (get lessee lease)) (err ERR-ALREADY-ACCEPTED))
      (map-set leases
        { lease-id: lease-id }
        (merge lease {
          lessee: (some tx-sender),
          start-block: block-height,
          state: LEASE-STATE-ACTIVE
        })
      )
      (print { event: "lease-accepted", lease-id: lease-id, lessee: tx-sender })
      (ok true)
    )
    (err ERR-LEASE-NOT-FOUND)
  )
)

(define-public (terminate-lease (lease-id uint))
  (match (map-get? leases { lease-id: lease-id })
    lease
    (begin
      (asserts! (or (is-lessor lease-id tx-sender) (is-admin tx-sender)) (err ERR-UNAUTHORIZED))
      (asserts! (is-eq (get state lease) LEASE-STATE-ACTIVE) (err ERR-LEASE-NOT-ACTIVE))
      (map-set leases
        { lease-id: lease-id }
        (merge lease { state: LEASE-STATE-TERMINATED })
      )
      (print { event: "lease-terminated", lease-id: lease-id })
      (ok true)
    )
    (err ERR-LEASE-NOT-FOUND)
  )
)

(define-public (log-extraction (lease-id uint) (amount uint))
  (match (map-get? leases { lease-id: lease-id })
    lease
    (match (map-get? lease-usage { lease-id: lease-id })
      usage
      (begin
        (asserts! (is-lessee lease-id tx-sender) (err ERR-NOT-LESSEE))
        (asserts! (is-eq (get state lease) LEASE-STATE-ACTIVE) (err ERR-LEASE-NOT-ACTIVE))
        (asserts! (< (+ (get current-extraction usage) amount) (get extraction-cap lease)) (err ERR-EXTRACTION-CAP-EXCEEDED))
        (asserts! (< (+ (get start-block lease) (get duration-blocks lease)) block-height) (err ERR-LEASE-EXPIRED)) ;; Check not expired
        (let ((new-extraction (+ (get current-extraction usage) amount))
              (payment-due (* amount (get price-per-unit lease))))
          (map-set lease-usage
            { lease-id: lease-id }
            (merge usage {
              current-extraction: new-extraction,
              last-log-block: block-height,
              pending-payments: (+ (get pending-payments usage) payment-due)
            })
          )
          (print { event: "extraction-logged", lease-id: lease-id, amount: amount, payment-due: payment-due })
          (ok true)
        )
      )
      (err ERR-LEASE-NOT-FOUND)
    )
    (err ERR-LEASE-NOT-FOUND)
  )
)

(define-public (add-auditor (lease-id uint) (auditor principal) (permissions (list 3 (string-ascii 32))))
  (match (map-get? leases { lease-id: lease-id })
    lease
    (begin
      (asserts! (is-lessor lease-id tx-sender) (err ERR-NOT-LESSOR))
      (map-set lease-auditors
        { lease-id: lease-id, auditor: auditor }
        {
          added-at: block-height,
          permissions: permissions
        }
      )
      (print { event: "auditor-added", lease-id: lease-id, auditor: auditor })
      (ok true)
    )
    (err ERR-LEASE-NOT-FOUND)
  )
)

(define-public (update-oracle (new-oracle principal))
  (begin
    (asserts! (is-admin tx-sender) (err ERR-UNAUTHORIZED))
    (var-set oracle-principal new-oracle)
    (ok true)
  )
)

(define-public (oracle-log-extraction (lease-id uint) (amount uint))
  (match (map-get? leases { lease-id: lease-id })
    lease
    (match (map-get? lease-usage { lease-id: lease-id })
      usage
      (begin
        (asserts! (is-eq tx-sender (var-get oracle-principal)) (err ERR-INVALID-ORACLE))
        (asserts! (is-eq (get state lease) LEASE-STATE-ACTIVE) (err ERR-LEASE-NOT-ACTIVE))
        (asserts! (< (+ (get current-extraction usage) amount) (get extraction-cap lease)) (err ERR-EXTRACTION-CAP-EXCEEDED))
        (asserts! (< (+ (get start-block lease) (get duration-blocks lease)) block-height) (err ERR-LEASE-EXPIRED))
        (let ((new-extraction (+ (get current-extraction usage) amount))
              (payment-due (* amount (get price-per-unit lease))))
          (map-set lease-usage
            { lease-id: lease-id }
            (merge usage {
              current-extraction: new-extraction,
              last-log-block: block-height,
              pending-payments: (+ (get pending-payments usage) payment-due)
            })
          )
          (print { event: "oracle-extraction-logged", lease-id: lease-id, amount: amount, payment-due: payment-due })
          (ok true)
        )
      )
      (err ERR-LEASE-NOT-FOUND)
    )
    (err ERR-LEASE-NOT-FOUND)
  )
)

;; Read-only Functions
(define-read-only (get-lease-details (lease-id uint))
  (map-get? leases { lease-id: lease-id })
)

(define-read-only (get-lease-usage (lease-id uint))
  (map-get? lease-usage { lease-id: lease-id })
)

(define-read-only (get-lease-auditor (lease-id uint) (auditor principal))
  (map-get? lease-auditors { lease-id: lease-id, auditor: auditor })
)

(define-read-only (get-next-lease-id)
  (var-get next-lease-id)
)

(define-read-only (get-oracle)
  (var-get oracle-principal)
)

(define-read-only (is-lease-active (lease-id uint))
  (match (map-get? leases { lease-id: lease-id })
    lease (is-eq (get state lease) LEASE-STATE-ACTIVE)
    false
  )
)

(define-read-only (calculate-pending-payment (lease-id uint))
  (match (map-get? lease-usage { lease-id: lease-id })
    usage (ok (get pending-payments usage))
    (err ERR-LEASE-NOT-FOUND)
  )
)

(define-read-only (check-compliance (lease-id uint) (metric (string-ascii 32)) (value uint))
  (match (map-get? leases { lease-id: lease-id })
    lease
    (let ((constraints (get env-constraints lease)))
      (fold check-constraint constraints { found: false, compliant: false, target: value, metric: metric })
    )
    (err ERR-LEASE-NOT-FOUND)
  )
)

(define-private (check-constraint (constraint { metric: (string-ascii 32), max-value: uint }) (acc { found: bool, compliant: bool, target: uint, metric: (string-ascii 32) }))
  (if (is-eq (get metric constraint) (get metric acc))
    { found: true, compliant: (<= (get target acc) (get max-value constraint)), target: (get target acc), metric: (get metric acc) }
    acc
  )
)