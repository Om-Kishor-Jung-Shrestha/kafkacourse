export class UserMapper {
  static toDto(user: any) {
    const { password, refreshTokens, ...safe } = user;
    return safe;
  }
}
