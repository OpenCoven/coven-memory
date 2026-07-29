import SwiftUI

struct ExceptionNotice: View {
    enum Kind {
        case warning
        case failure
        case unavailable
        case incompatible

        var symbol: String {
            switch self {
            case .warning: "exclamationmark.triangle"
            case .failure: "xmark.octagon"
            case .unavailable: "wifi.slash"
            case .incompatible: "exclamationmark.arrow.trianglehead.2.clockwise.rotate.90"
            }
        }

        var color: Color {
            switch self {
            case .warning, .unavailable, .incompatible: .orange
            case .failure: .red
            }
        }
    }

    let kind: Kind
    let title: LocalizedStringKey
    let actionTitle: LocalizedStringKey?
    let action: (() -> Void)?

    init(
        kind: Kind,
        title: LocalizedStringKey,
        actionTitle: LocalizedStringKey? = nil,
        action: (() -> Void)? = nil
    ) {
        self.kind = kind
        self.title = title
        self.actionTitle = actionTitle
        self.action = action
    }

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: CovenTheme.Spacing.medium) {
            Image(systemName: kind.symbol)
                .foregroundStyle(kind.color)
                .accessibilityHidden(true)
            Text(title)
                .font(.subheadline)
                .frame(maxWidth: .infinity, alignment: .leading)
            if let actionTitle, let action {
                Button(actionTitle, action: action)
                    .font(.subheadline.weight(.semibold))
            }
        }
        .padding(.vertical, CovenTheme.Spacing.medium)
        .accessibilityElement(children: .combine)
    }
}
