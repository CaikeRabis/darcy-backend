import Foundation
import Security

let account = "darcy-e2e-c0361-r1"
let servicePrefix = "com.escritacomciencia.darcy.e2e.darcy-e2e-c0361-r1"
let allowedServices = [
    "\(servicePrefix).DARCY_E2E_POSTGRES_PASSWORD",
    "\(servicePrefix).DARCY_E2E_JWT_SECRET",
]

func fail() -> Never {
    fputs("KEYCHAIN_READ_FAILED\n", stderr)
    exit(1)
}

let arguments = Array(CommandLine.arguments.dropFirst())
guard arguments.count == 4,
      arguments[0] == "--account",
      arguments[2] == "--service",
      arguments[1] == account,
      allowedServices.contains(arguments[3]) else {
    fail()
}

let query: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrAccount as String: account,
    kSecAttrService as String: arguments[3],
    kSecReturnData as String: true,
    kSecMatchLimit as String: kSecMatchLimitOne,
]

var item: CFTypeRef?
guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
      let data = item as? Data,
      !data.isEmpty else {
    fail()
}

FileHandle.standardOutput.write(data)
