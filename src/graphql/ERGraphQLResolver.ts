import {GraphQLResolveInfo} from "graphql/type/definition";
import {User} from "../User";
import {IArgs, IERGraphQLResolver} from "./ERGraphQLSchema";
import ERQueryAnalyzer from "./ERQueryAnalyzer";
import {ERQueryExecutor} from "./ERQueryExecutor";

export class ERGraphQLResolver implements IERGraphQLResolver {

  public async queryResolver(source: any, args: IArgs, context: User, info: GraphQLResolveInfo): Promise<any> {
    const query = ERQueryAnalyzer.resolveInfo(info);
    if (query.length) {
      return await new ERQueryExecutor(context).execute(query[0]); // TODO
    }
    return null;
  }
}
