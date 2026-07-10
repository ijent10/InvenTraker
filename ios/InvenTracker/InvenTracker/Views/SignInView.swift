import SwiftUI

struct SignInView: View {
    @EnvironmentObject private var session: AppSession
    @State private var email = ""
    @State private var password = ""
    @FocusState private var focused: Field?

    private enum Field { case email, password }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 28) {
                    VStack(spacing: 14) {
                        BrandMark(size: 78)
                        Text("Welcome back").font(.largeTitle.bold())
                        Text("Sign in to your organization workspace.")
                            .foregroundStyle(.secondary)
                    }
                    .padding(.top, 44)

                    VStack(spacing: 16) {
                        TextField("Work email", text: $email)
                            .textContentType(.emailAddress)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .focused($focused, equals: .email)
                            .submitLabel(.next)
                            .onSubmit { focused = .password }
                        SecureField("Password", text: $password)
                            .textContentType(.password)
                            .focused($focused, equals: .password)
                            .submitLabel(.go)
                            .onSubmit(signIn)
                    }
                    .textFieldStyle(.roundedBorder)

                    Button(action: signIn) {
                        Text("Sign in").frame(maxWidth: .infinity).padding(.vertical, 5)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .disabled(email.isEmpty || password.isEmpty)
                }
                .frame(maxWidth: 430)
                .padding(24)
                .frame(maxWidth: .infinity)
            }
            .background(Color(.systemGroupedBackground))
        }
    }

    private func signIn() {
        focused = nil
        Task { await session.signIn(email: email, password: password) }
    }
}
