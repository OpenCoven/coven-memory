import SwiftUI

struct MemoryFilterSheet: View {
  @Binding var filters: MemoryFilter
  let familiarOptions: [String]
  let sourceOptions: [MemorySource]
  let clear: () -> Void

  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      Form {
        Section {
          Picker("Familiar", selection: familiarBinding) {
            Text("Any familiar").tag("")
            ForEach(familiarOptions, id: \.self) { familiar in
              Text(familiar.capitalized).tag(familiar)
            }
          }
          Picker("Source", selection: sourceBinding) {
            Text("Any source").tag("")
            ForEach(sourceOptions, id: \.kind) { source in
              Text(source.label).tag(source.kind)
            }
          }
          Picker("Verification", selection: verificationBinding) {
            Text("Any status").tag("")
            ForEach(MemoryVerificationState.allCases, id: \.rawValue) {
              Text(verificationTitle($0)).tag($0.rawValue)
            }
          }
          Picker("Updated", selection: freshnessBinding) {
            Text("Any time").tag("")
            Text("Today").tag("today")
            Text("Previous 7 Days").tag("week")
            Text("Older").tag("older")
          }
        }
        .pickerStyle(.navigationLink)
      }
      .navigationTitle("Filters")
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Clear") {
            clear()
            dismiss()
          }
          .disabled(activeFilterCount == 0)
        }
        ToolbarItem(placement: .confirmationAction) {
          Button("Done") { dismiss() }
        }
      }
    }
    .presentationDetents([.medium, .large])
  }

  private var activeFilterCount: Int {
    [
      filters.familiarId != nil,
      filters.sourceKind != nil,
      filters.verification != nil,
      filters.freshness != nil,
    ].count(where: { $0 })
  }

  private var familiarBinding: Binding<String> {
    Binding(
      get: { filters.familiarId ?? "" },
      set: { filters.familiarId = $0.isEmpty ? nil : $0 }
    )
  }

  private var sourceBinding: Binding<String> {
    Binding(
      get: { filters.sourceKind ?? "" },
      set: { filters.sourceKind = $0.isEmpty ? nil : $0 }
    )
  }

  private var verificationBinding: Binding<String> {
    Binding(
      get: { filters.verification?.rawValue ?? "" },
      set: { filters.verification = MemoryVerificationState(rawValue: $0) }
    )
  }

  private var freshnessBinding: Binding<String> {
    Binding(
      get: {
        switch filters.freshness {
        case .today: "today"
        case .previousSevenDays: "week"
        case .older: "older"
        case nil: ""
        }
      },
      set: {
        filters.freshness =
          switch $0 {
          case "today": .today
          case "week": .previousSevenDays
          case "older": .older
          default: nil
          }
      }
    )
  }

  private func verificationTitle(
    _ state: MemoryVerificationState
  ) -> String {
    switch state {
    case .verified: "Verified"
    case .needsReview: "Needs review"
    case .degraded: "Degraded"
    case .unknown: "Unknown"
    case .unavailable: "Unavailable"
    }
  }
}
